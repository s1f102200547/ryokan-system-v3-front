'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import type { FirebaseError } from 'firebase/app'
import { firebaseApp } from '@/lib/firebase/client'
import { CREDENTIAL_ERROR_CODES } from '@/lib/firebase/credentialErrorCodes'

// ログイン処理＋UI状態（loading / error / 遷移）をまとめる
// 1. Firebase Client SDK で認証 → idToken 取得
// 2. idToken を /api/auth/login に POST → サーバーが Session Cookie を発行
export function useLogin() {
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  const login = async (credentials: { email: string; password: string }) => {
    setIsPending(true)
    setError(null)
    try {
      // Step 1: Firebase Client SDK で認証
      let idToken: string
      try {
        const auth = getAuth(firebaseApp)
        const credential = await signInWithEmailAndPassword(auth, credentials.email, credentials.password)
        idToken = await credential.user.getIdToken()
      } catch (e) {
        const code = (e as FirebaseError).code
        if (CREDENTIAL_ERROR_CODES.has(code)) {
          setError('メールアドレスまたはパスワードが正しくありません')
        } else {
          setError('サービスが一時的に利用できません。しばらくお待ちください')
        }
        return
      }

      // Step 2: idToken をサーバーに送り Session Cookie を発行してもらう
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      })
      if (response.ok) {
        router.push('/')
        return
      }
      // 503・500 ともに原因を明かさずあいまいに返す（監視インフラの存在を公開しない）
      setError('サービスが一時的に利用できません。しばらくお待ちください')
    } catch {
      setError('通信エラーが発生しました。ネットワーク接続を確認してください')
    } finally {
      setIsPending(false)
    }
  }

  return { login, isPending, error }
}
