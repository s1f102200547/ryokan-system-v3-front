'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MFA_RESEND_COOLDOWN_MS } from '@/constants/auth'

type Credentials = { email: string; password: string }

// ログイン処理＋UI状態（loading / error / 遷移）をまとめる。2段に分かれる:
//   1. credentials: メールアドレスとパスワードを /api/auth/login に送る。合っていれば、サーバーがフロントの電話に SMS を送る
//   2. code: SMS のコードを /api/auth/login/verify に送る。合っていれば、サーバーが Session Cookie を発行する
// 電話を登録していないアカウントは、サーバーが MFA_MODE=enrolled_only（本番で SMS を試す間）なら 1 で Session Cookie を受け取って終わる
// パスワード・コードの確認と Cookie の発行はサーバーが行う（ブラウザから Firebase を呼ばない。失敗回数をサーバーで数えるため）。
// getRecaptchaToken: 1段目を送る直前に reCAPTCHA Enterprise の token を作る（本番。SMS の送信に Identity Platform が求める）。
// サイトキーを設定していない開発・Emulator では渡さない（token なしで送る）
export function useLogin({ getRecaptchaToken }: { getRecaptchaToken?: () => Promise<string> } = {}) {
  const [step, setStep] = useState<'credentials' | 'code'>('credentials')
  const [phoneHint, setPhoneHint] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null) // 「コードを再送しました」など、エラーでない知らせ
  // 再送のために、1段目で送ったメールアドレスとパスワードを持っておく（画面の入力欄にも残っている。サーバーには送り直すだけ）
  const credentialsRef = useRef<Credentials | null>(null)
  // 送信中か（1段目・2段目・再送で共通）。state の isPending は描画の後にしか変わらないので、同じ描画の中で2回呼ばれると
  // 2回送っていた（F-12・F-11）。ref はすぐ変わる。成功して画面が移るときは true のまま（hook ごと捨てられる）
  const inFlightRef = useRef(false)
  // 失敗が続いて止められている（429 too_many_attempts）間は、画面のボタンを押せなくし、残りの時間を出す。
  // 時間が来たら自動で戻す。時間は PC の時計ではなく、受け取ってからの経過（performance.now）で数える（時計の巻き戻りに左右されない）。
  // 早く戻ってもサーバーがまだ止めていれば、また 429 になるだけ（止めている間の試行は数えないので、止める時間は延びない）
  const [lockDeadline, setLockDeadline] = useState<number | null>(null)
  const [lockRemainingMs, setLockRemainingMs] = useState<number | null>(null)
  const isLocked = lockRemainingMs !== null
  // SMS を送ってから「コードを再送」を押せるまでの待ち（MFA_RESEND_COOLDOWN_MS）。止められている間と同じく経過時間で数える
  const [resendDeadline, setResendDeadline] = useState<number | null>(null)
  const [resendRemainingMs, setResendRemainingMs] = useState<number | null>(null)
  const router = useRouter()

  useEffect(() => {
    if (lockDeadline === null) return
    const timer = setInterval(() => {
      const left = lockDeadline - performance.now()
      if (left <= 0) {
        setLockDeadline(null)
        setLockRemainingMs(null)
      } else {
        setLockRemainingMs(left)
      }
    }, LOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [lockDeadline])

  useEffect(() => {
    if (resendDeadline === null) return
    const timer = setInterval(() => {
      const left = resendDeadline - performance.now()
      if (left <= 0) {
        setResendDeadline(null)
        setResendRemainingMs(null)
      } else {
        setResendRemainingMs(left)
      }
    }, LOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [resendDeadline])

  // 失敗の応答を画面の状態にする（401 以外。両方の段で同じ）
  const showCommonFailure = (response: Response, body: ErrorBody): void => {
    if (response.status === 429 && body.error === 'attempt_in_progress') {
      setError('混み合っています。しばらくしてからもう一度お試しください')
      return
    }
    if (response.status === 429 && body.error === 'sms_limit') {
      setError('今日の SMS の送信回数の上限に達しました。管理者に連絡してください')
      return
    }
    if (response.status === 429) {
      // 失敗が続いて止められている。サーバーの指定がなければ1分（早すぎても、またサーバーが断るだけ）
      const lockMs = typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0
        ? body.retryAfterSeconds * 1000
        : DEFAULT_LOCK_MS
      setLockDeadline(performance.now() + lockMs)
      setLockRemainingMs(lockMs)
      return
    }
    if (response.status === 403) {
      setError(FORBIDDEN_MESSAGES[String(body.error)] ?? FORBIDDEN_MESSAGES.outside_business_hours)
      return
    }
    // 503・500 ともに原因を明かさずあいまいに返す（監視インフラの存在を公開しない）
    setError('サービスが一時的に利用できません。しばらくお待ちください')
  }

  // 1段目。再送（resend）も同じ手順で送り直す
  const sendCredentials = async (credentials: Credentials, { isResend }: { isResend: boolean }) => {
    if (isLocked || inFlightRef.current) return
    inFlightRef.current = true
    setIsPending(true)
    setError(null)
    setNotice(null)
    let succeeded = false
    try {
      let recaptchaToken: string | undefined
      if (getRecaptchaToken) {
        try {
          recaptchaToken = await getRecaptchaToken()
        } catch {
          // Google の reCAPTCHA を読み込めない（回線・拡張機能が止めている）。パスワードはまだ送っていない
          setError('ブラウザの確認（reCAPTCHA）を読み込めませんでした。ページを読み込み直して、もう一度お試しください')
          return
        }
      }
      const response = await postWithBusyRetry('/api/auth/login', {
        email: credentials.email, password: credentials.password, ...(recaptchaToken === undefined ? {} : { recaptchaToken }),
      })
      const body = await readBody(response)
      // パスワードだけでログインが終わった（SMS なし）。2段目の成功と同じく、移り終わるまで isPending のままにする
      if (response.ok && body.success === true) {
        succeeded = true
        router.push('/daily-dashboard')
        return
      }
      if (response.ok && body.mfaRequired === true) {
        credentialsRef.current = credentials
        setPhoneHint(typeof body.phoneHint === 'string' && body.phoneHint !== '' ? body.phoneHint : null)
        setStep('code')
        // SMS を送った。ここから再送を待たせる（送れなかったときは待たせない）
        setResendDeadline(performance.now() + MFA_RESEND_COOLDOWN_MS)
        setResendRemainingMs(MFA_RESEND_COOLDOWN_MS)
        if (isResend) setNotice('コードを再送しました')
        return
      }
      if (response.status === 401 && body.error === 'login_failed') {
        // パスワードは合ったが、サーバーが通さなかった（SMS なしのログインで、トークンが無効。理由は返ってこない）
        setError('ログインできませんでした。もう一度ログインしてください')
        return
      }
      if (response.status === 401) {
        setError('メールアドレスまたはパスワードが正しくありません')
        return
      }
      showCommonFailure(response, body)
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
    } finally {
      if (!succeeded) {
        inFlightRef.current = false
        setIsPending(false)
      }
    }
  }

  const login = (credentials: Credentials) => sendCredentials(credentials, { isResend: false })

  // 2段目。成功したらダッシュボードへ直接移る（/ を経由すると proxy.ts の転送で1往復増える）。
  // 移り終わるまで isPending のままにし、ボタンを押せない「確認中…」にしておく（画面が移ればこの hook ごと捨てられる）。
  // 返り値: 合っていたか（画面は、合わなければ入力欄を空にして打ち直させる）。確認中・止められている間は送らずに false
  const verify = async (code: string): Promise<boolean> => {
    if (isLocked || inFlightRef.current) return false
    inFlightRef.current = true
    setIsPending(true)
    setError(null)
    setNotice(null)
    let succeeded = false
    try {
      const response = await postWithBusyRetry('/api/auth/login/verify', { code })
      if (response.ok) {
        succeeded = true
        router.push('/daily-dashboard')
        return true
      }
      const body = await readBody(response)
      if (response.status === 401 && body.error === 'mfa_expired') {
        // 途中の状態が切れた（5分）。パスワードからやり直す（パスワードマネージャーが入れ直すので、押し直すだけ）
        setStep('credentials')
        setError('コードの有効期限が切れました。もう一度ログインしてください')
        return false
      }
      if (response.status === 401 && body.error === 'login_failed') {
        // コードは合ったが、サーバーがログインを通さなかった（理由は返ってこない）。打ち直しても通らないので、パスワードからやり直す
        setStep('credentials')
        setError('ログインできませんでした。もう一度ログインしてください')
        return false
      }
      if (response.status === 401) {
        setError('コードが正しくありません')
        return false
      }
      showCommonFailure(response, body)
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
    } finally {
      if (!succeeded) {
        inFlightRef.current = false
        setIsPending(false)
      }
    }
    return false
  }

  // コードを送り直す（SMS が届かない・期限が近い）。1日の上限まで。前の SMS から待ち時間が過ぎるまでは送らない
  const resend = async () => {
    if (credentialsRef.current === null || resendRemainingMs !== null) return
    await sendCredentials(credentialsRef.current, { isResend: true })
  }

  // 1段目へ戻る（別のアカウントで入り直す）
  const back = () => {
    setStep('credentials')
    setError(null)
    setNotice(null)
  }

  // 止められている間のメッセージは、残りの時間から作る（毎秒変わる）。
  // resendWaitSeconds: 「コードを再送」を押せるまでの秒（切り上げ）。0 なら押せる
  return {
    step, phoneHint, login, verify, resend, back, isPending, isLocked, notice,
    resendWaitSeconds: resendRemainingMs === null ? 0 : Math.max(1, Math.ceil(resendRemainingMs / 1000)),
    error: isLocked ? lockMessage(lockRemainingMs) : error,
  }
}

// 「4:59」の形（秒は切り上げ。0:00 は出さない）。止められている間と、再送の待ちで使う
export function formatWait(remainingMs: number): string {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const LOCK_TICK_MS = 250
const DEFAULT_LOCK_MS = 60_000

// 403 の理由。本文が読めなければ時間外として扱う（今までの表示）
const FORBIDDEN_MESSAGES: Record<string, string> = {
  outside_business_hours: '利用時間外です（6:00〜23:00）',
  client_not_allowed: 'この PC もしくはブラウザからはログインできません。',
  mfa_not_enrolled: 'このアカウントは SMS の確認が設定されていません。管理者に連絡してください',
  no_second_factor: 'このアカウントは SMS の確認が設定されていません。管理者に連絡してください',
  recaptcha_failed: 'ブラウザの確認（reCAPTCHA）で止められました。ページを読み込み直して、もう一度お試しください',
}

function lockMessage(remainingMs: number): string {
  return `ログインの失敗が続いたため、あと ${formatWait(remainingMs)} はログインできません`
}

const MAX_BUSY_RETRIES = 5
const MAX_BUSY_WAIT_MS = 3000

// 同じ PC・同じ回線で同時に試行中（attempt_in_progress）なら、少し待って自動で送り直す。押し直させない
async function postWithBusyRetry(url: string, payload: object): Promise<Response> {
  const post = () => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  let response = await post()
  for (let retry = 0; retry < MAX_BUSY_RETRIES && response.status === 429; retry++) {
    const busy = await readBody(response.clone())
    if (busy.error !== 'attempt_in_progress') break
    await sleep(busyWaitMs(busy.retryAfterSeconds))
    response = await post()
  }
  return response
}

// サーバーの指定（秒）に従う。ただし長く待たせない（最大3秒）。指定がなければ1秒
function busyWaitMs(retryAfterSeconds: unknown): number {
  if (typeof retryAfterSeconds !== 'number' || !(retryAfterSeconds > 0)) return 1000
  return Math.min(retryAfterSeconds * 1000, MAX_BUSY_WAIT_MS)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

type ErrorBody = { error?: unknown; retryAfterSeconds?: unknown; mfaRequired?: unknown; phoneHint?: unknown; success?: unknown }

// 本文の決まったキーだけを読む。JSON でなければ空
async function readBody(response: Response): Promise<ErrorBody> {
  const body: unknown = await response.json().catch(() => null)
  if (typeof body !== 'object' || body === null) return {}
  return body as ErrorBody
}
