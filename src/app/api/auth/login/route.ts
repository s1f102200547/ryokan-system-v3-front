import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loginCommand } from '@/application/auth/loginCommand'
import { InfraError } from '@/types/errors'
import { infraErrorToStatus } from '@/lib/infraErrorToHttpStatus'
import { logger } from '@/lib/logger'

const BodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid request' }, { status: 400 })
  }
  const { email, password } = parsed.data

  try {
    const result = await loginCommand({ email, password }) //application層を使う

    if (!result.success) {
      logger.warn('ログイン失敗: 認証情報不正', { email })
      return NextResponse.json({ error: result.error }, { status: 401 })
    }

    logger.info('ログイン成功', { userId: result.value.userId })

    //セキュアにするために後で変更する必要あり
    const response = NextResponse.json({ success: true })
    response.cookies.set('session', result.value.userId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    })
    return response
  } catch (e) {
    if (e instanceof InfraError) { //想定内の例外の時
      const status = infraErrorToStatus(e.code)
      logger.error('ログイン InfraError', { infraErrorCode: e.code, httpStatus: status, message: e.message })
      return NextResponse.json({ error: 'server error' }, { status })
    }
    logger.error('ログイン 想定外エラー', { message: String(e) })
    return NextResponse.json({ error: 'server error' }, { status: 500 })
  }
}
