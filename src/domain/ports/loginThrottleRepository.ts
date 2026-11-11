import type { ThrottleState } from '@/domain/auth/loginThrottle'
import type { Result } from '@/types/result'

// ログインの失敗回数を数える単位。value はメールアドレス（小文字にする）か IP
export type ThrottleKey = { kind: 'email' | 'ip'; value: string }

export type AcquiredAttempt = { lockMs: number | null; failures: number; previous: ThrottleState | null }

export interface LoginThrottleRepository {
  // ない key は null（テスト・調査用）
  read(keys: ThrottleKey[]): Promise<(ThrottleState | null)[]>
  // 試す前に呼ぶ。どれかの key が止まっていれば何も書かずに retryAfterMs。
  // 止まっていなければ、すべての key に失敗を1回先に足す（確認と記録を1つのトランザクションで行う。同時の試行ですり抜けられない）。
  // 返すのは key ごとの、この1回で止め始める時間（止めなければ null）と回数、先に足す前の状態（refund に渡す）
  acquire(keys: ThrottleKey[], nowMs: number): Promise<Result<AcquiredAttempt[], { retryAfterMs: number }>>
  // 先に足した1回分を返す（障害でパスワードを確かめられなかったとき）。acquired と nowMs は acquire に渡した・受け取ったもの
  refund(keys: ThrottleKey[], acquired: AcquiredAttempt[], nowMs: number): Promise<void>
  // 成功したら 0 に戻す（ドキュメントを消す）
  reset(keys: ThrottleKey[]): Promise<void>
}
