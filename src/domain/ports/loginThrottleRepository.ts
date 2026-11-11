import type { ThrottleState } from '@/domain/auth/loginThrottle'

// ログインの失敗回数を数える単位。value はメールアドレス（小文字にする）か IP
export type ThrottleKey = { kind: 'email' | 'ip'; value: string }

export interface LoginThrottleRepository {
  // ない key は null
  read(keys: ThrottleKey[]): Promise<(ThrottleState | null)[]>
  // すべての key に失敗を1回足す（読んでから書くまでを1つのトランザクションで行う。同時の失敗で数え漏れがない）。
  // 返すのは key ごとの、この失敗で止め始めた時間（止めなければ null）と回数
  recordFailure(keys: ThrottleKey[], nowMs: number): Promise<{ lockMs: number | null; failures: number }[]>
  // 成功したら 0 に戻す（ドキュメントを消す）
  reset(keys: ThrottleKey[]): Promise<void>
}
