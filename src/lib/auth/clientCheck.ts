import { LOGIN_ALLOWED_BROWSERS, LOGIN_ALLOWED_OS } from '@/constants/auth'
import { parseUserAgent } from '@/lib/auth/userAgent'
import type { Result } from '@/types/result'

export type ClientRejection = 'os_not_allowed' | 'browser_not_allowed'

// ログインを許す端末か。旅館の PC（Windows）の Chrome か Edge だけを通す。アカウントには結び付けない
export function checkClient(userAgent: string | null): Result<void, ClientRejection> {
  const { browser, os } = parseUserAgent(userAgent)
  if (!(LOGIN_ALLOWED_OS as readonly string[]).includes(os)) return { success: false, error: 'os_not_allowed' }
  if (!(LOGIN_ALLOWED_BROWSERS as readonly string[]).includes(browser)) return { success: false, error: 'browser_not_allowed' }
  return { success: true, value: undefined }
}
