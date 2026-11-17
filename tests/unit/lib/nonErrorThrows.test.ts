// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InfraError } from '@/types/errors'

// Error でない値が投げられたとき（文字列・null・数値）。外部の SDK は Error でない値を投げることがある（docs/MfaBugHunt.md の S10）。
// 落ちずに、障害（AUTH_UNAVAILABLE・500/503）として扱い、ログと Slack に値を文字列で残す
vi.mock('@/lib/firebase/admin', () => ({ adminAuth: { verifySessionCookie: vi.fn(), getUser: vi.fn() }, adminDb: {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/slack', () => ({ notifySlackFireAndForget: vi.fn() }))
import { adminAuth } from '@/lib/firebase/admin'
import { logger } from '@/lib/logger'
import { verifySession } from '@/lib/auth/verifySession'
import { handleRouteError } from '@/lib/api/routeHelpers'

describe('Error でない例外', () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([['文字列', 'socket hang up'], ['null', null], ['数値', 503]])(
    'verifySession: Session Cookie の確認が %s を投げたら、未ログインにせず AUTH_UNAVAILABLE', async (_label, thrown) => {
      vi.mocked(adminAuth.verifySessionCookie).mockRejectedValue(thrown)
      await expect(verifySession('cookie')).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' })
    })

  it('handleRouteError: InfraError の元の例外が文字列なら、そのままログに残す', async () => {
    const res = handleRouteError(new InfraError('AUTH_UNAVAILABLE', 'down', 'raw cause'), 'テスト')
    expect(res.status).toBe(503)
    expect(vi.mocked(logger.error).mock.calls[0][1]).toMatchObject({ cause: 'raw cause' })
  })
})
