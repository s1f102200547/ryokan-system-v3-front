import { render, screen, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DelayedSpinner, DELAYED_SPINNER_MS } from '@/components/DelayedSpinner'

// 待ちが 0.5 秒を超えたときだけ出すスピナー。短い待ちでは何も出さない（少し回って消えるちらつきを避ける）

describe('DelayedSpinner', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('0.5 秒は 500ms', () => {
    expect(DELAYED_SPINNER_MS).toBe(500)
  })

  it('出てから 0.5 秒たつまでは何も出さず、たったら出す', async () => {
    render(<DelayedSpinner label="読み込んでいます" />)
    await act(async () => { vi.advanceTimersByTime(DELAYED_SPINNER_MS - 1) })
    expect(screen.queryByRole('progressbar')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(1) })
    expect(screen.getByRole('progressbar', { name: '読み込んでいます' })).toBeInTheDocument()
  })

  it('0.5 秒より前に外されたら（読み込みが終わったら）一度も出さない', async () => {
    const view = render(<DelayedSpinner label="読み込んでいます" />)
    await act(async () => { vi.advanceTimersByTime(300) })
    view.unmount()
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('外してからまた出したら、そこから数え直す', async () => {
    const view = render(<DelayedSpinner key="a" label="読み込んでいます" />)
    await act(async () => { vi.advanceTimersByTime(400) })
    view.rerender(<DelayedSpinner key="b" label="読み込んでいます" />)
    await act(async () => { vi.advanceTimersByTime(400) })
    expect(screen.queryByRole('progressbar')).toBeNull()
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })
})
