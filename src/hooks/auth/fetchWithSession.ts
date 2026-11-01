'use client'

// ログインが必要な API を呼ぶときに fetch の代わりに使う。
// API が 401 を返したら（Session Cookie の期限切れ、Emulator の再起動など）ログイン画面へ移る。
// 移動中にエラーメッセージを一瞬表示しないよう、401 のときは結果を返さずに待たせる（画面遷移で破棄される）
// /api/auth/login には使わない（そこでの 401 は「認証情報が違う」の意味）
export async function fetchWithSession(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401 && typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login')
    return new Promise<Response>(() => {})
  }
  return res
}
