import { logger } from '@/lib/logger'

// 読み取りで破損として読み飛ばした予約をログに残す（BugHunting.md #10）。
// 読み飛ばした予約は画面から消え、空室に見えてダブルブッキングにつながるため、人が直す必要がある。
// 取得ごとに件数・ID・理由を WARN で出す（Cloud Logging で件数を追える）。
// Slack には通知しない（データの異常は障害ではなく、画面を開くたびに通知すると本物の障害が埋もれるため。2026-10-31 決定）

export type SkippedReservation = { id: string; reason: string }

export function reportSkippedReservations(skipped: SkippedReservation[]): void {
  if (skipped.length === 0) return
  logger.warn('壊れた予約を読み飛ばした（画面に表示されない）', {
    count: skipped.length,
    ids: skipped.map((s) => s.id),
    reasons: skipped.map((s) => s.reason),
  })
}
