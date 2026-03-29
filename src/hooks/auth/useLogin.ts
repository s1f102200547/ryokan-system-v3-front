'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { loginCommand } from '@/application/auth/loginCommand'

// ログイン処理＋UI状態（loading / error / 遷移）をまとめる
export function useLogin() {
  const [isPending, setIsPending] = useState(false) // ログイン中かどうか
  const [error, setError] = useState<string | null>(null) 
  const router = useRouter() // ページ遷移用

  const login = async (credentials: { email: string; password: string }) => {
    setIsPending(true) // ログイン中をonにする
    setError(null) // エラーをリセットする
    const result = await loginCommand(credentials) // application層のCommandを使う
    if (!result.success) {
      setError('メールアドレスまたはパスワードが正しくありません')
    } else {
      router.push('/')
    }
    setIsPending(false) // ログイン中をoffにする
  }

  return { login, isPending, error }
}
