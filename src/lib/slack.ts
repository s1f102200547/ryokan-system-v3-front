import { logger } from './logger'

export async function notifySlack(message: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) return // 未設定（dev/test）は静かにスキップ
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  })
}

// 呼び出し側は必ず fire-and-forget(slack通知の結果を待たない) で使う:
export function notifySlackFireAndForget(message: string): void {
  notifySlack(message).catch((e) => logger.error('Slack通知失敗', { message: String(e) }))
}
