import { render, screen, fireEvent, act, within } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { fetchWithSession } from '@/hooks/auth/fetchWithSession'
import { GuestInfoSection } from '@/components/guestInfo/GuestInfoSection'
import { ThemeProvider } from '@/components/ThemeProvider'
import type { Reservation } from '@/types/reservation'
import { controlledFetch } from '@tests/utils/controlledFetch'
import { makeReservation } from '@tests/utils/reservationFixture'

vi.mock('@/hooks/auth/fetchWithSession', () => ({ fetchWithSession: vi.fn() }))

// 予約カードの一覧（Domain.md「予約カードと編集モーダル」）:
// - 対象日 C/I の有効な予約と、滞在中の予約。部屋番号の順。滞在中は灰色・クリック不可。キャンセル済みは下に別表示
// - 同じ部屋・同じ夜に2件以上あれば警告
// - 編集モーダルを閉じたら、キャンセル・手動追加が終わったら、一覧を取り直す

type GuestInfoBody = { normal: Reservation[]; staying: Reservation[]; cancelled: Reservation[]; roomConflicts: { room: string; reservationIds: string[] }[] }
const empty: GuestInfoBody = { normal: [], staying: [], cancelled: [], roomConflicts: [] }

const isGuestInfo = (date: string) => (r: { url: string; method: string }) =>
  r.method === 'GET' && r.url === `/api/guest-info?date=${date}`

function ui(date: string) {
  return (
    <ThemeProvider>
      <GuestInfoSection selectedDate={date} />
    </ThemeProvider>
  )
}

const cards = () => screen.queryAllByTestId('reservation-card')
const cardTexts = () => cards().map((c) => c.textContent ?? '')

describe('GuestInfoSection', () => {
  let net: ReturnType<typeof controlledFetch>
  beforeEach(() => {
    vi.mocked(fetchWithSession).mockReset()
    net = controlledFetch(vi.mocked(fetchWithSession))
  })

  async function show(date: string, body: GuestInfoBody) {
    const view = render(ui(date))
    await net.last(isGuestInfo(date)).resolve(200, body)
    return view
  }

  describe('表示', () => {
    it('当日 C/I と滞在中を部屋番号の順に並べ、部屋未定は最後', async () => {
      await show('2026-04-12', {
        ...empty,
        normal: [
          makeReservation({ id: 'a', room: '43', guest_name: '四十三' }),
          makeReservation({ id: 'b', room: null, guest_name: '未定' }),
          makeReservation({ id: 'c', room: '21', guest_name: '二十一' }),
        ],
        staying: [makeReservation({ id: 'd', room: '31', guest_name: '連泊', check_in_date: '2026-04-11', check_out_date: '2026-04-14' })],
      })
      const names = cardTexts()
      expect(names.map((t) => ['二十一', '連泊', '四十三', '未定'].find((n) => t.includes(n)))).toEqual(['二十一', '連泊', '四十三', '未定'])
    })

    it('部屋番号は数として比べる（"9" の後に "10" ではなく、文字列の順にしない）', async () => {
      // 部屋番号はすべて2桁なので、ここでは 21 < 22 < 61 の順になることだけを見る
      await show('2026-04-12', {
        ...empty,
        normal: [
          makeReservation({ id: 'a', room: '61', guest_name: 'A61' }),
          makeReservation({ id: 'b', room: '22', guest_name: 'A22' }),
          makeReservation({ id: 'c', room: '21', guest_name: 'A21' }),
        ],
      })
      expect(cardTexts().map((t) => t.match(/A\d+/)?.[0])).toEqual(['A21', 'A22', 'A61'])
    })

    it('滞在中のカードは押してもモーダルを開かない', async () => {
      await show('2026-04-12', {
        ...empty,
        staying: [makeReservation({ id: 'd', room: '31', guest_name: '連泊', check_in_date: '2026-04-11', check_out_date: '2026-04-14' })],
      })
      fireEvent.click(cards()[0])
      expect(screen.queryByRole('dialog')).toBeNull()
    })

    it('キャンセル済みは別の欄に出し、押せば編集モーダルを開く', async () => {
      await show('2026-04-12', {
        ...empty,
        normal: [makeReservation({ id: 'a', room: '21', guest_name: '有効' })],
        cancelled: [makeReservation({ id: 'x', room: '22', cancel: 1, guest_name: '取消' })],
      })
      const section = screen.getByTestId('cancelled-section')
      expect(section).toHaveTextContent('取消')
      expect(section).not.toHaveTextContent('有効')
      fireEvent.click(within(section).getByTestId('reservation-card'))
      expect(screen.getByRole('dialog')).toHaveTextContent('取消')
    })

    it('部屋の重複があれば部屋番号と件数で警告する', async () => {
      await show('2026-04-12', { ...empty, roomConflicts: [{ room: '21', reservationIds: ['a', 'b'] }] })
      expect(screen.getByTestId('room-conflict-alert')).toHaveTextContent('21号室（2件）')
    })

    it('取得に失敗したらエラーを出し、カードを出さない', async () => {
      render(ui('2026-04-12'))
      await net.last(isGuestInfo('2026-04-12')).resolve(500)
      expect(screen.getByRole('alert')).toHaveTextContent('データの取得に失敗しました')
      expect(cards()).toHaveLength(0)
    })
  })

  describe('日付の切り替え', () => {
    it('切り替えたら前の日のカードを消し、新しい日のカードだけを出す', async () => {
      const view = await show('2026-04-12', { ...empty, normal: [makeReservation({ id: 'a', guest_name: '12日の客' })] })
      view.rerender(ui('2026-04-13'))
      expect(cardTexts().some((t) => t.includes('12日の客'))).toBe(false)
      await net.last(isGuestInfo('2026-04-13')).resolve(200, { ...empty, normal: [makeReservation({ id: 'b', guest_name: '13日の客' })] })
      expect(cardTexts().some((t) => t.includes('13日の客'))).toBe(true)
      expect(cardTexts().some((t) => t.includes('12日の客'))).toBe(false)
    })

    it('前の日の応答が遅れて届いても、前の日のカードを出さない', async () => {
      const view = render(ui('2026-04-12'))
      view.rerender(ui('2026-04-13'))
      await net.last(isGuestInfo('2026-04-13')).resolve(200, { ...empty, normal: [makeReservation({ id: 'b', guest_name: '13日の客' })] })
      await net.last(isGuestInfo('2026-04-12')).resolve(200, { ...empty, normal: [makeReservation({ id: 'a', guest_name: '12日の客' })] })
      expect(cardTexts().join()).toContain('13日の客')
      expect(cardTexts().join()).not.toContain('12日の客')
    })
  })

  describe('取り直し', () => {
    it('編集モーダルを閉じたら一覧を取り直し、新しい値を出す', async () => {
      await show('2026-04-12', { ...empty, normal: [makeReservation({ id: 'a', guest_name: '前の名前' })] })
      fireEvent.click(cards()[0])
      await act(async () => {
        fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '閉じる' }))
      })
      const refetch = net.pending(isGuestInfo('2026-04-12'))
      expect(refetch).toHaveLength(1)
      await refetch[0].resolve(200, { ...empty, normal: [makeReservation({ id: 'a', guest_name: '新しい名前' })] })
      expect(cardTexts().join()).toContain('新しい名前')
    })

    it('キャンセルが成功したら一覧を取り直し、知らせる', async () => {
      await show('2026-04-12', { ...empty, normal: [makeReservation({ id: 'a', guest_name: '客' })] })
      fireEvent.click(screen.getByTestId('cancel-button'))
      const dialog = screen.getByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('スタッフ名'), { target: { value: '佐藤' } })
      fireEvent.change(within(dialog).getByLabelText('キャンセル理由'), { target: { value: 'no show' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル実行' }))
      const cancel = net.last((r) => r.url === '/api/reservations/a/cancel')
      expect(cancel.body).toEqual({ staff_name: '佐藤', target_date: '2026-04-12', reason: 'no show' })
      await cancel.resolve(200)
      expect(net.pending(isGuestInfo('2026-04-12'))).toHaveLength(1)
      expect(screen.getByText('キャンセルしました')).toBeInTheDocument()
    })
  })

  describe('キャンセルのダイアログ', () => {
    it('失敗したエラーは、閉じて別の予約で開き直したら消えている', async () => {
      await show('2026-04-12', {
        ...empty,
        normal: [makeReservation({ id: 'a', room: '21', guest_name: '客A' }), makeReservation({ id: 'b', room: '22', guest_name: '客B' })],
      })
      fireEvent.click(screen.getAllByTestId('cancel-button')[0])
      let dialog = screen.getByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('スタッフ名'), { target: { value: '佐藤' } })
      fireEvent.change(within(dialog).getByLabelText('キャンセル理由'), { target: { value: 'no show' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル実行' }))
      await net.last((r) => r.url === '/api/reservations/a/cancel').resolve(500)
      expect(within(dialog).getByRole('alert')).toHaveTextContent('キャンセルに失敗しました')
      fireEvent.click(within(dialog).getByRole('button', { name: '戻る' }))

      fireEvent.click(screen.getAllByTestId('cancel-button')[1])
      dialog = screen.getByRole('dialog', { name: /客B/ })
      expect(within(dialog).queryByRole('alert')).toBeNull()
    })
  })

  describe('キャンセルのダイアログ（同じ予約）', () => {
    it('失敗したあと閉じて同じ予約で開き直したら、エラーも入力も消えている', async () => {
      await show('2026-04-12', { ...empty, normal: [makeReservation({ id: 'a', guest_name: '客A' })] })
      fireEvent.click(screen.getByTestId('cancel-button'))
      let dialog = screen.getByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('スタッフ名'), { target: { value: '佐藤' } })
      fireEvent.change(within(dialog).getByLabelText('キャンセル理由'), { target: { value: 'no show' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル実行' }))
      await net.last((r) => r.url === '/api/reservations/a/cancel').resolve(500)
      fireEvent.click(within(dialog).getByRole('button', { name: '戻る' }))

      fireEvent.click(screen.getByTestId('cancel-button'))
      dialog = screen.getByRole('dialog')
      expect(within(dialog).queryByRole('alert')).toBeNull()
      expect(within(dialog).getByLabelText('スタッフ名')).toHaveValue('')
    })
  })

  describe('予約追加のダイアログ', () => {
    it('C/O 日の初期値は、今表示している日の翌日', async () => {
      const view = await show('2026-04-12', empty)
      view.rerender(ui('2026-04-10'))
      await net.last(isGuestInfo('2026-04-10')).resolve(200, empty)
      fireEvent.click(screen.getByTestId('add-reservation-card'))
      const dialog = screen.getByRole('dialog')
      expect(dialog).toHaveTextContent('C/I: 2026-04-10')
      // C/O 日の欄（DatePicker）の値。表示の形式は YYYY/MM/DD
      const values = Array.from(dialog.querySelectorAll<HTMLInputElement>('input')).map((i) => i.value)
      expect(values).toContain('2026/04/11')
    })

    it('失敗したエラーは、閉じて開き直したら消えている', async () => {
      await show('2026-04-12', empty)
      fireEvent.click(screen.getByTestId('add-reservation-card'))
      let dialog = screen.getByRole('dialog')
      fireEvent.change(within(dialog).getByLabelText('ゲスト名'), { target: { value: '新客' } })
      fireEvent.change(within(dialog).getByLabelText('担当スタッフ名'), { target: { value: '佐藤' } })
      fireEvent.change(within(dialog).getByLabelText('追加理由'), { target: { value: '電話予約' } })
      fireEvent.mouseDown(within(dialog).getAllByRole('combobox')[2])
      fireEvent.click(within(screen.getByRole('listbox')).getByRole('option', { name: '21' }))
      fireEvent.click(within(dialog).getByRole('button', { name: '追加' }))
      await net.last((r) => r.method === 'POST').resolve(500)
      expect(within(dialog).getByRole('alert')).toHaveTextContent('予約の追加に失敗しました')
      fireEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }))

      fireEvent.click(screen.getByTestId('add-reservation-card'))
      dialog = screen.getByRole('dialog')
      expect(within(dialog).queryByRole('alert')).toBeNull()
    })
  })
})
