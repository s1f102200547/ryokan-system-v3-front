import { NextResponse } from 'next/server'
import { loginCommand } from '@/application/auth/loginCommand'

export async function POST(request: Request) {
  const { email, password } = await request.json() //送られてきたjsonの中身を取得
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
