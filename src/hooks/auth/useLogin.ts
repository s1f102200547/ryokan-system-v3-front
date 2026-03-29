'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

// ログイン処理＋UI状態（loading / error / 遷移）をまとめる
// loginCommand を直接呼ばず Route Handler 経由にすることで
// サーバー側で Cookie を発行できる
export function useLogin() {
  const [isPending, setIsPending] = useState(false) // ログイン中かどうか
  const [error, setError] = useState<string | null>(null)
  const router = useRouter() // ページ遷移用

  const login = async (credentials: { email: string; password: string }) => {
    setIsPending(true) // ログイン中をonにする
    setError(null)// エラーをリセットする
    try {
      const response = await fetch('/api/auth/login', { //api経由でlogin機能を使う
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
      if (!response.ok) {
        setError('メールアドレスまたはパスワードが正しくありません')
      } else {
        router.push('/')
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setIsPending(false)// ログイン中をoffにする
    }
  }

  return { login, isPending, error }
}
