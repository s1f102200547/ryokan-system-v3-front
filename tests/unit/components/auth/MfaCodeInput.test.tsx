import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { INVALID_MFA_CODE_CHAR_MESSAGE, MfaCodeInput } from '@/components/auth/MfaCodeInput'

// SMS のコードの入力欄（6マス）。全角の数字は半角に直し、数字以外は入れずに理由を出す。6桁そろったら1回だけ送る。
// 日本語入力の変換の途中は値を書き換えない（確定で直す）

function Harness({ onComplete, readOnly = false, disabled = false }: { onComplete: (d: string) => void; readOnly?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState('')
  return <MfaCodeInput value={value} onChange={setValue} onComplete={onComplete} readOnly={readOnly} disabled={disabled} />
}

function setup(props: { readOnly?: boolean; disabled?: boolean } = {}) {
  const onComplete = vi.fn()
  render(<Harness onComplete={onComplete} {...props} />)
  const input = screen.getByLabelText<HTMLInputElement>('確認コード')
  const cells = () => screen.getAllByTestId('mfa-code-cell').map((c) => c.textContent)
  const type = (value: string) => fireEvent.change(input, { target: { value } })
  return { input, cells, type, onComplete }
}

describe('MfaCodeInput', () => {
  it('1つの入力欄に、数字の入力・ワンタイムコードの自動入力の印を付け、最初からフォーカスする', () => {
    const { input } = setup()
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveFocus()
    expect(screen.getAllByTestId('mfa-code-cell')).toHaveLength(6)
  })

  it('打った数字を1マスずつ出す', () => {
    const { type, cells, input } = setup()
    type('12')
    expect(input.value).toBe('12')
    expect(cells()).toEqual(['1', '2', '', '', '', ''])
  })

  it('全角の数字は半角にして受け付ける（理由は出さない）', () => {
    const { type, input } = setup()
    type('１２３')
    expect(input.value).toBe('123')
    expect(screen.queryByText(INVALID_MFA_CODE_CHAR_MESSAGE)).toBeNull()
  })

  it('数字以外は入れず、理由を出す。次に正しく打てば消える', () => {
    const { type, input } = setup()
    type('12')
    type('12a')
    expect(input.value).toBe('12')
    expect(screen.getByText(INVALID_MFA_CODE_CHAR_MESSAGE)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    type('123')
    expect(input.value).toBe('123')
    expect(screen.queryByText(INVALID_MFA_CODE_CHAR_MESSAGE)).toBeNull()
  })

  it('理由はスクリーンリーダーにも読み上げる（aria-live）', () => {
    const { type } = setup()
    type('x')
    expect(screen.getByRole('status')).toHaveTextContent(INVALID_MFA_CODE_CHAR_MESSAGE)
  })

  it('6桁そろったら1回だけ送る。それより先は入らない', () => {
    const { type, input, onComplete } = setup()
    type('12345')
    expect(onComplete).not.toHaveBeenCalled()
    type('123456')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onComplete).toHaveBeenCalledWith('123456')
    type('1234567')
    expect(input.value).toBe('123456')
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('SMS からの貼り付け（区切りつき）でも、そろえば送る', () => {
    const { type, onComplete } = setup()
    type('123 456')
    expect(onComplete).toHaveBeenCalledWith('123456')
  })

  it('消して打ち直し、またそろえば、また送る', () => {
    const { type, onComplete } = setup()
    type('123456')
    type('12345')
    type('123457')
    expect(onComplete.mock.calls).toEqual([['123456'], ['123457']])
  })

  describe('日本語入力（IME）', () => {
    it('変換の途中は値を書き換えず送らない。確定したら半角にする', () => {
      const { input, cells, onComplete } = setup()
      fireEvent.compositionStart(input)
      fireEvent.change(input, { target: { value: '１２３４５６' } })
      expect(input.value).toBe('１２３４５６') // 変換の途中の文字はそのまま（書き換えると変換が壊れる）
      expect(cells()).toEqual(['1', '2', '3', '4', '5', '6']) // マスには数字として出す
      expect(onComplete).not.toHaveBeenCalled()

      fireEvent.compositionEnd(input, { target: { value: '１２３４５６' } })
      expect(input.value).toBe('123456')
      expect(onComplete).toHaveBeenCalledWith('123456')
    })

    it('変換で文字が確定したら、理由を出して数字だけ残す', () => {
      const { input } = setup()
      fireEvent.compositionStart(input)
      fireEvent.change(input, { target: { value: 'あ' } })
      expect(screen.queryByText(INVALID_MFA_CODE_CHAR_MESSAGE)).toBeNull() // 途中では出さない
      fireEvent.compositionEnd(input, { target: { value: 'あ' } })
      expect(input.value).toBe('')
      expect(screen.getByText(INVALID_MFA_CODE_CHAR_MESSAGE)).toBeInTheDocument()
    })
  })

  it('確認中（readOnly）は入力を受け付けないがフォーカスは残す。止められている間（disabled）は触れない', () => {
    const { input } = setup({ readOnly: true })
    expect(input).toHaveAttribute('readonly')
    expect(input).toBeEnabled()
    render(<Harness onComplete={vi.fn()} disabled />)
    expect(screen.getAllByLabelText('確認コード')[1]).toBeDisabled()
  })
})
