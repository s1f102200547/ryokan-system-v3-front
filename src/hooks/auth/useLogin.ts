'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ログイン処理＋UI状態（loading / error / 遷移）をまとめる。
// メールアドレスとパスワードを /api/auth/login に送るだけ。パスワードの確認と Session Cookie の発行はサーバーが行う
// （ブラウザから Firebase を呼ばない。失敗回数をサーバーで数えるため）
export function useLogin() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const login = async (credentials: { email: string; password: string }) => {
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
        // 失敗が続いて止められている。いつまでかを分で出す（端数は切り上げ）
        const minutes = typeof body.retryAfterSeconds === 'number' && body.retryAfterSeconds > 0
          ? Math.ceil(body.retryAfterSeconds / 60)
          : null
        setError(minutes === null
          ? 'ログインの失敗が続いたため、しばらくログインできません'
          : `ログインの失敗が続いたため、${minutes}分後までログインできません`)
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

  return { login, isPending, error }
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
