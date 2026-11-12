import type { Result } from '@/types/result'

// パスワードが合ってから、SMS のコードを確かめるまでの途中の状態（純粋）。保存は infra/auth/firestoreMfaPendingRepository.ts。
// mfaPendingCredential・sessionInfo は Firebase に渡すだけの秘密。ブラウザには渡さず、ログにも出さない
export type MfaPending = {
  email: string               // 失敗回数を数える key と Slack の通知に使う（PC のアカウントのメールアドレス）
  ip: string | null           // パスワードを確かめたときの接続元。コードは同じ接続元からしか受け付けない
  mfaPendingCredential: string
  sessionInfo: string
  phoneHint: string           // 伏せ字の電話番号（画面に出す）
  expiresAtMs: number
}

export type MfaPendingRejection = 'expired' | 'ip_mismatch'

// コードを確かめてよい途中の状態か。ない・期限切れなら expired（最初からやり直す）、接続元が違えば ip_mismatch
export function checkMfaPending(pending: MfaPending | null, ip: string | null, nowMs: number): Result<MfaPending, MfaPendingRejection> {
  if (pending === null || pending.expiresAtMs <= nowMs) return { success: false, error: 'expired' }
  if (pending.ip !== ip) return { success: false, error: 'ip_mismatch' }
  return { success: true, value: pending }
}
