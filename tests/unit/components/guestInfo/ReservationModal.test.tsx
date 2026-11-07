import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { ReservationModal } from '@/components/guestInfo/ReservationModal'
import { ThemeProvider } from '@/components/ThemeProvider'
import type { Reservation } from '@/types/reservation'
import { controlledFetch } from '@tests/utils/controlledFetch'
import { makeReservation } from '@tests/utils/reservationFixture'

vi.mock('@/hooks/auth/fetchWithSession', () => ({ fetchWithSession: vi.fn() }))

// 編集モーダルの自動保存（Domain.md「予約カードと編集モーダル」）:
// - 入力ごとに変更を貯め、500ms の debounce か blur で PATCH /api/reservations/{id} に送る
// - 保存は直列（前の保存が終わってから次を送る）
// - 通信エラー・5xx の変更は貯め直して次の機会に再送し、閉じるときにも送る。4xx は捨てる
// - 閉じるときは保存が終わってから閉じる。送り直しても失敗したら確認する

const DEBOUNCE_MS = 500

function renderModal(reservation: Reservation = makeReservation()) {
  const onClose = vi.fn()
  render(
    <ThemeProvider>
      <ReservationModal reservation={reservation} onClose={onClose} />
    </ThemeProvider>,
  )
  return { onClose }
}

function openSection(label: string) {
  fireEvent.click(within(screen.getByRole('dialog')).getByText(label, { exact: true }))
}

function nameInput() {
  return screen.getByRole('textbox', { name: 'ゲスト名' })
}

function typeName(value: string) {
  fireEvent.change(nameInput(), { target: { value } })
}

async function advance(ms: number) {
  await act(async () => { vi.advanceTimersByTime(ms) })
}

// MUI の Select で選ぶ（combobox を開いて、選択肢を押す）。
// モーダルの Select は InputLabel と labelId が結び付いておらず名前がないので、開いている combobox の何番目かで指す
function selectOption(index: number, optionName: string) {
  fireEvent.mouseDown(within(screen.getByRole('dialog')).getAllByRole('combobox')[index])
  fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: optionName }))
}

async function clickClose() {
  await act(async () => {
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '閉じる' }))
  })
}

describe('ReservationModal の自動保存', () => {
  let net: ReturnType<typeof controlledFetch>
  const patches = () => net.requests.filter((r) => r.method === 'PATCH')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fetchWithSession).mockReset()
    net = controlledFetch(vi.mocked(fetchWithSession))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('入力から 500ms たつまで送らず、たったら変更したフィールドだけを送る', async () => {
    renderModal()
    openSection('name')
    typeName('山田花子')
    await advance(DEBOUNCE_MS - 1)
    expect(patches()).toHaveLength(0)
    await advance(1)
    expect(patches()).toHaveLength(1)
    expect(patches()[0]).toMatchObject({ url: '/api/reservations/rsv-1', body: { guest_name: '山田花子' } })
  })

  it('500ms 以内の連続した入力は、最後の値を1回だけ送る', async () => {
    renderModal()
    openSection('name')
    typeName('山')
    await advance(300)
    typeName('山田')
    await advance(300)
    typeName('山田花')
    await advance(DEBOUNCE_MS)
    expect(patches().map((p) => p.body)).toEqual([{ guest_name: '山田花' }])
  })

  it('入力欄から離れたら（blur）待たずに送る', async () => {
    renderModal()
    openSection('name')
    typeName('山田花子')
    fireEvent.focusOut(nameInput())
    await advance(0)
    expect(patches().map((p) => p.body)).toEqual([{ guest_name: '山田花子' }])
  })

  it('保存は直列。前の保存が返るまで次を送らない', async () => {
    renderModal()
    openSection('name')
    typeName('A')
    await advance(DEBOUNCE_MS)
    typeName('AB')
    await advance(DEBOUNCE_MS)
    expect(patches()).toHaveLength(1)
    await patches()[0].resolve(200)
    await advance(0)
    expect(patches().map((p) => p.body)).toEqual([{ guest_name: 'A' }, { guest_name: 'AB' }])
  })

  it('5xx で失敗した変更は貯め直し、次の保存で一緒に送る（新しい入力を優先）', async () => {
    renderModal()
    openSection('name')
    openSection('room')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await patches()[0].resolve(500)
    expect(screen.getByText('保存に失敗しました。管理者に通知済みです。')).toBeInTheDocument()
    selectOption(0, '22')
    typeName('AB')
    await advance(DEBOUNCE_MS)
    expect(patches()[1].body).toEqual({ guest_name: 'AB', room: '22' })
  })

  it('保存中に同じフィールドを入力してから保存が失敗したら、再送では新しい入力を送る', async () => {
    renderModal()
    openSection('name')
    typeName('A')
    await advance(DEBOUNCE_MS)
    // 1回目の保存が返る前に、同じフィールドを打ち直す
    typeName('AB')
    await patches()[0].resolve(500)
    await advance(DEBOUNCE_MS)
    expect(patches().map((p) => p.body)).toEqual([{ guest_name: 'A' }, { guest_name: 'AB' }])
  })

  it('通信エラーで失敗した変更も貯め直す', async () => {
    renderModal()
    openSection('name')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await patches()[0].fail()
    openSection('room')
    selectOption(0, '22')
    await advance(DEBOUNCE_MS)
    expect(patches()[1].body).toEqual({ guest_name: 'A', room: '22' })
  })

  it('4xx で断られた変更は捨てる（送り直しても通らない）', async () => {
    renderModal()
    openSection('name')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await patches()[0].resolve(400)
    openSection('room')
    selectOption(0, '22')
    await advance(DEBOUNCE_MS)
    expect(patches()[1].body).toEqual({ room: '22' })
  })

  it('閉じるときは、待っている変更を送り、保存が返ってから閉じる', async () => {
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await clickClose()
    expect(patches().map((p) => p.body)).toEqual([{ guest_name: 'A' }])
    expect(onClose).not.toHaveBeenCalled()
    await patches()[0].resolve(200)
    await advance(0)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('保存中に閉じたら、その保存が返ってから閉じる', async () => {
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await clickClose()
    expect(onClose).not.toHaveBeenCalled()
    await patches()[0].resolve(200)
    await advance(0)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(patches()).toHaveLength(1)
  })

  it('変更がなければ、何も送らずに閉じる', async () => {
    const { onClose } = renderModal()
    await clickClose()
    expect(patches()).toHaveLength(0)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('失敗していた変更は閉じるときに送り直し、成功すれば確認なしで閉じる', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await patches()[0].resolve(503)
    await clickClose()
    expect(patches()[1].body).toEqual({ guest_name: 'A' })
    await patches()[1].resolve(200)
    await advance(0)
    expect(confirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('閉じるときの送り直しも失敗したら確認し、キャンセルなら閉じない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await clickClose()
    await patches()[0].fail()
    await advance(0)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('閉じるときの送り直しも失敗し、確認で OK なら閉じる', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await clickClose()
    await patches()[0].resolve(500)
    await advance(0)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

// 4xx で断られた変更は送り直さないが、閉じると失われるので、閉じるときに確認する（通信エラーのときと同じ形）
describe('ReservationModal: 断られた変更があるときの「閉じる」', () => {
  let net: ReturnType<typeof controlledFetch>
  const patches = () => net.requests.filter((r) => r.method === 'PATCH')
  const REJECTED_MESSAGE = '保存できなかった変更があります（入力内容の誤り）。閉じると失われます。閉じますか？'
  const UNSAVED_MESSAGE = '保存できていない変更があります。閉じると失われます。閉じますか？'

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fetchWithSession).mockReset()
    net = controlledFetch(vi.mocked(fetchWithSession))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('入力の直後に閉じて 400 で断られたら確認し、キャンセルなら閉じない', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await clickClose()
    await patches()[0].resolve(400)
    await advance(0)
    expect(confirm).toHaveBeenCalledWith(REJECTED_MESSAGE)
    expect(onClose).not.toHaveBeenCalled()
    // 断られた理由はモーダルの中に出ている
    expect(screen.getByText('入力内容に誤りがあるため保存できませんでした。画面を再読み込みして入力し直してください。')).toBeInTheDocument()
  })

  it('確認で OK なら閉じる', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await clickClose()
    await patches()[0].resolve(404)
    await advance(0)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('前に断られた変更が残っていれば、閉じるときに確認する', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await patches()[0].resolve(400)
    await clickClose()
    expect(patches()).toHaveLength(1)
    expect(confirm).toHaveBeenCalledWith(REJECTED_MESSAGE)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('断られたフィールドを入力し直して保存できたら、確認なしで閉じる', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    const { onClose } = renderModal()
    openSection('name')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await patches()[0].resolve(400)
    typeName('AB')
    await advance(DEBOUNCE_MS)
    await patches()[1].resolve(200)
    await clickClose()
    expect(confirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('断られたのと別のフィールドを保存できても、断られたフィールドが残れば確認する', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderModal()
    openSection('name')
    openSection('room')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await patches()[0].resolve(400)
    selectOption(0, '22')
    await advance(DEBOUNCE_MS)
    await patches()[1].resolve(200)
    await clickClose()
    expect(confirm).toHaveBeenCalledWith(REJECTED_MESSAGE)
  })

  it('通信エラーの変更も残っていれば、通信エラーの確認を出す（確認は1回）', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderModal()
    openSection('name')
    openSection('room')
    typeName('A')
    await advance(DEBOUNCE_MS)
    await patches()[0].resolve(400)
    selectOption(0, '22')
    await clickClose()
    // 部屋の保存（選んだ時点の blur で送る）と、閉じるときの送り直しを、どちらも通信エラーにする
    for (let i = 0; i < 5 && net.pending((r) => r.method === 'PATCH').length > 0; i++) {
      await net.pending((r) => r.method === 'PATCH')[0].fail()
      await advance(0)
    }
    expect(net.pending((r) => r.method === 'PATCH')).toHaveLength(0)
    expect(patches().slice(1).every((p) => (p.body as { room?: string }).room === '22')).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith(UNSAVED_MESSAGE)
  })
})

describe('ReservationModal の泊別配列・年代', () => {
  let net: ReturnType<typeof controlledFetch>
  const patches = () => net.requests.filter((r) => r.method === 'PATCH')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(fetchWithSession).mockReset()
    net = controlledFetch(vi.mocked(fetchWithSession))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('大人の人数を変えると age_groups を同じ長さにして一緒に送る。減らしてから戻すと値が戻る', async () => {
    renderModal(makeReservation({ adult_count: 2, age_groups: ['30s', '40s'] }))
    openSection('number')
    selectOption(0, '1')
    await advance(DEBOUNCE_MS)
    expect(patches()[0].body).toEqual({ adult_count: 1, age_groups: ['30s'] })
    await patches()[0].resolve(200)
    selectOption(0, '3')
    await advance(DEBOUNCE_MS)
    expect(patches()[1].body).toEqual({ adult_count: 3, age_groups: ['30s', '40s', null] })
  })
})
