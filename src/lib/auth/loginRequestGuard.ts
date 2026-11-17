import type { Result } from '@/types/result'

// ログイン前の API（/api/auth/login・/api/auth/login/verify）に、他のサイトのページから送らせない（F-21）。
// Session Cookie の SameSite=Strict はログイン前の API を守らない。パスワードを知る者が罠のページを旅館の PC で開かせると、
// 旅館の IP・Windows の Chrome として1段目を送らせ、フロントの電話に SMS を送らせられた。
// - Content-Type: application/json だけ。HTML のフォームは application/json を送れない
// - Sec-Fetch-Site: same-origin だけ。ログインを許している Windows の Chrome・Edge は必ず付ける（ブラウザが付け、ページからは変えられない）
export type LoginRequestRejection = 'content_type' | 'cross_site'

export function checkLoginRequest(headers: Headers): Result<void, LoginRequestRejection> {
  const mediaType = headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  if (mediaType !== 'application/json') return { success: false, error: 'content_type' }
  if (headers.get('sec-fetch-site') !== 'same-origin') return { success: false, error: 'cross_site' }
  return { success: true, value: undefined }
}
