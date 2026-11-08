import { render, screen, fireEvent, within } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { ReservationListCard } from '@/components/guestInfo/ReservationListCard'
import { ThemeProvider } from '@/components/ThemeProvider'
import type { Reservation } from '@/types/reservation'
import type { GuestInfoToggle } from '@/types/guestInfo'
import { makeReservation } from '@tests/utils/reservationFixture'

// 予約カード（Domain.md「予約カードと編集モーダル」）:
// - 上部のトグル（到着・露天・夕食・朝食）で、対象日の泊の値を出す。泊インデックス = dateDiff(C/I, 対象日)
// - 夕食: NONE・CANCEL は出さない、PENDING は「未定」。到着は対象日に C/I する予約だけ（未入力は「未定」）
// - 滞在中のカードは灰色・クリック不可

// 2泊: 4/12 C/I → 4/14 C/O
const TWO_NIGHTS = makeReservation({
  check_in_date: '2026-04-12',
  check_out_date: '2026-04-14',
  arrival_time: '15:00',
  dinner_time: ['18:00', 'PENDING'],
  dinner_info: ['', ''],
  breakfast_time: ['7:30a', '8:00b'],
  open_air_bath_time: ['20:00', null],
  timetable_info: ['', ''],
})

function renderCard(props: { reservation?: Reservation; toggle?: GuestInfoToggle | null; targetDate?: string; isStaying?: boolean }) {
  const onClick = vi.fn()
  const onCancel = vi.fn()
  render(
    <ThemeProvider>
      <ReservationListCard
        reservation={props.reservation ?? TWO_NIGHTS}
        onClick={onClick}
        onCancelOrRestore={onCancel}
        selectedToggle={props.toggle ?? null}
        targetDate={props.targetDate ?? '2026-04-12'}
        isStaying={props.isStaying}
      />
    </ThemeProvider>,
  )
  return { onClick, onCancel, card: screen.getByTestId('reservation-card') }
}

describe('ReservationListCard のトグル表示', () => {
  it.each([
    ['dinner', '2026-04-12', '18:00'],
    ['dinner', '2026-04-13', '未定'],
    ['breakfast', '2026-04-12', '7:30a'],
    ['breakfast', '2026-04-13', '8:00b'],
    ['openAirBath', '2026-04-12', '20:00'],
    ['checkIn', '2026-04-12', '15:00'],
  ] as const)('%s・%s は %s', (toggle, targetDate, expected) => {
    const { card } = renderCard({ toggle, targetDate })
    expect(card).toHaveTextContent(expected)
  })

  it.each([
    ['dinner', 'NONE'],
    ['dinner', 'CANCEL'],
  ] as const)('夕食が %s のときは出さない', (_toggle, value) => {
    const { card } = renderCard({ toggle: 'dinner', reservation: { ...TWO_NIGHTS, dinner_time: [value, value] } })
    expect(card).not.toHaveTextContent(value)
  })

  it('露天・朝食が未入力（null）のときは出さない', () => {
    // 値のない欄は「—」を透明で出す（高さをそろえるため）。1泊目の値を出さないことを見る
    const { card } = renderCard({ toggle: 'openAirBath', targetDate: '2026-04-13' })
    expect(card).not.toHaveTextContent('20:00')
  })

  it('到着は対象日に C/I する予約だけ。滞在中（2泊目）には出さない', () => {
    const { card } = renderCard({ toggle: 'checkIn', targetDate: '2026-04-13', isStaying: true })
    expect(card).not.toHaveTextContent('15:00')
  })

  it('到着が未入力なら「未定」', () => {
    const { card } = renderCard({ toggle: 'checkIn', reservation: { ...TWO_NIGHTS, arrival_time: null } })
    expect(card).toHaveTextContent('未定')
  })

  it('トグルを選んでいなければ値を出さない', () => {
    const { card } = renderCard({ toggle: null })
    expect(card).not.toHaveTextContent('18:00')
    expect(card).not.toHaveTextContent('15:00')
  })

  it('泊別配列が壊れて短くても落ちない（値は出さない）', () => {
    const { card } = renderCard({ toggle: 'dinner', targetDate: '2026-04-13', reservation: { ...TWO_NIGHTS, dinner_time: ['18:00'] } })
    expect(card).not.toHaveTextContent('18:00')
  })
})

describe('ReservationListCard のクリック', () => {
  it('カードを押すと onClick、キャンセルボタンを押すと onCancelOrRestore だけを呼ぶ', () => {
    const { onClick, onCancel, card } = renderCard({})
    fireEvent.click(card)
    expect(onClick).toHaveBeenCalledWith(TWO_NIGHTS)
    fireEvent.click(screen.getByTestId('cancel-button'))
    expect(onCancel).toHaveBeenCalledWith(TWO_NIGHTS)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('滞在中のカードは押しても何も呼ばず、キャンセルボタンもない', () => {
    const { onClick, card } = renderCard({ isStaying: true, targetDate: '2026-04-13' })
    fireEvent.click(card)
    expect(onClick).not.toHaveBeenCalled()
    expect(screen.queryByTestId('cancel-button')).toBeNull()
    expect(card).toHaveAttribute('aria-disabled', 'true')
  })

  it('名前と部屋を出す。名前がなければ「（名前なし）」、部屋がなければ「—」', () => {
    const { card } = renderCard({ reservation: { ...TWO_NIGHTS, guest_name: '', room: null } })
    expect(card).toHaveTextContent('（名前なし）')
    // 「—」は部屋の欄と、トグルの値の欄（値がないときは透明で出す）の2つ
    expect(within(card).getAllByText('—')).toHaveLength(2)
  })
})
