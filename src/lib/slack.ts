import { logger } from './logger'

export async function notifySlack(message: string): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    if (process.env.NODE_ENV === 'production') {
      // production で未設定は設定ミスなので警告する
      logger.warn('SLACK_WEBHOOK_URL が未設定のため通知をスキップ')
    }
    return
  }
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  })
}

// 呼び出し側は必ず fire-and-forget(slack通知の結果を待たない) で使う:
export function notifySlackFireAndForget(message: string): void {
  notifySlack(message).catch((e) => {
    // webhook URL がエラーメッセージに含まれる場合があるためマスクする
    const masked = String(e).replace(/https?:\/\/\S+/g, '[URL]')
    logger.error('Slack通知失敗', { message: masked })
  })
}
