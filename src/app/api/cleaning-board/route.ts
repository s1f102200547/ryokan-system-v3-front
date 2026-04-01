import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getCleaningBoardUseCase } from '@/application/cleaningBoard/getCleaningBoardUseCase'

const QuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const parsed = QuerySchema.safeParse({ date: searchParams.get('date') })
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid date' }, { status: 400 })
  }

  try {
    const data = await getCleaningBoardUseCase(parsed.data.date)
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'internal server error' }, { status: 500 })
  }
}
