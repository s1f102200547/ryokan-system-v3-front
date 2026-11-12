import type { MfaPending } from '@/domain/auth/mfaPending'

// id は Cookie の値（推測できない乱数）。保存先ではハッシュにする（DB を読めても Cookie を作れない）
export interface MfaPendingRepository {
  save(id: string, pending: MfaPending): Promise<void>
  // ない・形が崩れていれば null
  get(id: string): Promise<MfaPending | null>
  delete(id: string): Promise<void>
}
