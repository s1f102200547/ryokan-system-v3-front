import type { AcquireRejection, AttemptOutcome, ThrottleState } from '@/domain/auth/loginThrottle'
import type { Result } from '@/types/result'

// ログインの失敗回数を数える単位。value はメールアドレス（小文字にする）か IP
export type ThrottleKey = { kind: 'email' | 'ip'; value: string }

export interface LoginThrottleRepository {
  // トランザクションを使わない読み取り。止まっているかを先に安く確かめる（攻撃の大半はここで 429 にする）。ない key は null
  read(keys: ThrottleKey[]): Promise<(ThrottleState | null)[]>
  // 試す前に、すべての key に試行中の札を出す（確認と札を1つのトランザクションで行う）。
  // 止まっていれば locked、札が埋まっていれば（同時の試行）busy。トランザクションがぶつかり合って諦めたときも busy
  acquire(keys: ThrottleKey[], nowMs: number, attemptId: string): Promise<Result<void, AcquireRejection>>
  // 確かめ終わったら札を外し、結果を確定させる。返すのは key ごとの、この結果で止め始めた時間（止めなければ null）と回数
  complete(keys: ThrottleKey[], attemptId: string, outcome: AttemptOutcome, nowMs: number): Promise<{ lockMs: number | null; failures: number }[]>
}
