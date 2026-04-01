import { NextResponse } from 'next/server'
import { z } from 'zod'
import { loginCommand } from '@/application/auth/loginCommand'

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
  const result = await loginCommand({ email, password }) //application層を使う

  if (!result.success) {
    return NextResponse.json({ error: result.reason }, { status: 401 })
  }

  //セキュアにするために後で変更する必要あり
  const response = NextResponse.json({ success: true })
  response.cookies.set('session', result.userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })
  return response
}
