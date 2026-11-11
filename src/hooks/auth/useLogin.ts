'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

// ログイン処理＋UI状態（loading / error / 遷移）をまとめる。
// メールアドレスとパスワードを /api/auth/login に送るだけ。パスワードの確認と Session Cookie の発行はサーバーが行う
// （ブラウザから Firebase を呼ばない。失敗回数をサーバーで数えるため）
export function useLogin() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 失敗が続いて止められている（429 too_many_attempts）間は、画面の入力欄とボタンをすべて押せなくし、残りの時間を出す。
  // 時間が来たら自動で戻す。時間は PC の時計ではなく、受け取ってからの経過（performance.now）で数える（時計の巻き戻りに左右されない）。
  // 早く戻ってもサーバーがまだ止めていれば、また 429 になるだけ（止めている間の試行は数えないので、止める時間は延びない）
  const [lockDeadline, setLockDeadline] = useState<number | null>(null)
  const [lockRemainingMs, setLockRemainingMs] = useState<number | null>(null)
  const isLocked = lockRemainingMs !== null
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

  const login = async (credentials: { email: string; password: string }) => {
    if (isLocked) return
    setIsPending(true)
    setError(null)
    let succeeded = false
    try {
      let response = await postLogin(credentials)
      // 同じ PC・同じ回線で同時に試行中（attempt_in_progress）なら、少し待って自動で送り直す。押し直させない
      for (let retry = 0; retry < MAX_BUSY_RETRIES && response.status === 429; retry++) {
        const busy = await readErrorBody(response.clone())
        if (busy.error !== 'attempt_in_progress') break
        await sleep(busyWaitMs(busy.retryAfterSeconds))
        response = await postLogin(credentials)
      }
      if (response.ok) {
        // ダッシュボードへ直接移る（/ を経由すると proxy.ts の転送で1往復増える）。
        // 移り終わるまで isPending のままにし、ボタンを押せない「ログイン中…」にしておく（画面が移ればこの hook ごと捨てられる）
        succeeded = true
        router.push('/daily-dashboard')
        return
      }
      if (response.status === 401) {
        setError('メールアドレスまたはパスワードが正しくありません')
        return
      }
      const body = await readErrorBody(response)
      if (response.status === 429 && body.error === 'attempt_in_progress') {
        setError('混み合っています。しばらくしてからもう一度お試しください')
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
        // 403 は「時間外」と「旅館の PC の Chrome・Edge でない」の2つ。本文が読めなければ時間外として扱う（今までの表示）
        setError(body.error === 'client_not_allowed'
          ? 'この PC・ブラウザからはログインできません。'
          : '利用時間外です（6:00〜23:00）')
        return
      }
      // 503・500 ともに原因を明かさずあいまいに返す（監視インフラの存在を公開しない）
      setError('サービスが一時的に利用できません。しばらくお待ちください')
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
    } finally {
      if (!succeeded) setIsPending(false)
    }
  }

  // 止められている間のメッセージは、残りの時間から作る（毎秒変わる）
  return { login, isPending, isLocked, error: isLocked ? lockMessage(lockRemainingMs) : error }
}

const LOCK_TICK_MS = 250
const DEFAULT_LOCK_MS = 60_000

// 「あと 4:59」の形（秒は切り上げ。0:00 は出さない）
function lockMessage(remainingMs: number): string {
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000))
  const mm = Math.floor(seconds / 60)
  const ss = String(seconds % 60).padStart(2, '0')
  return `ログインの失敗が続いたため、あと ${mm}:${ss} はログインできません`
}

const MAX_BUSY_RETRIES = 5
const MAX_BUSY_WAIT_MS = 3000

function postLogin(credentials: { email: string; password: string }): Promise<Response> {
  return fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  })
}

// サーバーの指定（秒）に従う。ただし長く待たせない（最大3秒）。指定がなければ1秒
function busyWaitMs(retryAfterSeconds: unknown): number {
  if (typeof retryAfterSeconds !== 'number' || !(retryAfterSeconds > 0)) return 1000
  return Math.min(retryAfterSeconds * 1000, MAX_BUSY_WAIT_MS)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// 本文の error と retryAfterSeconds だけを読む。JSON でなければ空
async function readErrorBody(response: Response): Promise<{ error?: unknown; retryAfterSeconds?: unknown }> {
  const body: unknown = await response.json().catch(() => null)
  if (typeof body !== 'object' || body === null) return {}
  return body as { error?: unknown; retryAfterSeconds?: unknown }
}
