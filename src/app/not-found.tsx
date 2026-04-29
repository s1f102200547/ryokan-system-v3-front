'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// not-found.tsxはserverComponentを使うとエラーが出るのでClientComponentを使用
export default function NotFound() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/')
  }, [router])
  return null
}
