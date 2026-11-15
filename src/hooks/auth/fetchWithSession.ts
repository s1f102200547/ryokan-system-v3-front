'use client'

// ログインが必要な API を呼ぶときに fetch の代わりに使う。
// API が 401 を返したら（Session Cookie の期限切れ、Emulator の再起動など）ログイン画面へ移る。
// 本番の時間外（23:05〜6:00。requireSession）の 403 outside_business_hours なら、利用時間外のページへ移る。
// 移動中にエラーメッセージを一瞬表示しないよう、移るときは結果を返さずに待たせる（画面遷移で破棄される）
// /api/auth/login には使わない（そこでの 401 は「認証情報が違う」の意味）
export async function fetchWithSession(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (typeof window === 'undefined') return res
  if (res.status === 401 && window.location.pathname !== '/login') {
    // コンポーネントの外なので useRouter は使えない。画面の状態も捨てたいので、意図して全体を読み込み直す
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/login')
    return new Promise<Response>(() => {})
  }
  if (res.status === 403 && window.location.pathname !== '/time-restricted' && (await isOutsideBusinessHours(res))) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign('/time-restricted')
    return new Promise<Response>(() => {})
  }
  return res
}

// 403 のうち時間外だけ（ほかの 403 は呼び出し側がそのまま扱う）。本文は clone から読み、呼び出し側にも残す
async function isOutsideBusinessHours(res: Response): Promise<boolean> {
  const body: unknown = await res.clone().json().catch(() => null)
  return typeof body === 'object' && body !== null && (body as { error?: unknown }).error === 'outside_business_hours'
}
