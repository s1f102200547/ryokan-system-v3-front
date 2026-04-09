import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCleaningBoardUseCase } from '@/application/cleaningBoard/getCleaningBoardUseCase'
import { InfraError } from '@/types/errors'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'
import { logger } from '@/lib/logger'
import { notifySlackFireAndForget } from '@/lib/slack'

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({ date: searchParams.get('date') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 }) //NextResponseはNext.js標準のクラス
  }

  try {
    const data = await getCleaningBoardUseCase(parsed.data.date) // CleaningBoard作成に必要なdbデータを取得&すぐ使えるように加工
    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof InfraError) {  // 検知したエラー(e)がInfraErrorとして扱える(=既知のエラー)場合
      const status = infraErrorToStatus(e.code)
      logger.error('清掃ボード取得 InfraError', { infraErrorCode: e.code, httpStatus: status, message: e.message })

      if (e.code === 'FIRESTORE_UNAVAILABLE') {
        notifySlackFireAndForget(`[ALERT] Firestore接続失敗: ${e.message}`)
      }
      if (e.code === 'FIRESTORE_VALIDATION') {
        notifySlackFireAndForget(`[ALERT] DBデータ破損（Zodパース失敗）: ${e.message}`)
      }

      return NextResponse.json({ error: 'internal server error' }, { status })
    }
    logger.error('清掃ボード取得 想定外エラー', { message: String(e) })
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }
}
