import { describe, it, expect } from 'vitest'
import { computeRoomCheckInState } from './roomState'
import type { Reservation } from '@/types/reservation'

const TARGET_DATE = '2026-04-01'

function makeReservation(overrides: Partial<Reservation>): Reservation {
  return {
    id: 'r1',
    check_in_date: TARGET_DATE,
    check_out_date: '2026-04-02',
    adult_count: 2,
    child_count: 0,
    room: '21',
    cancel: 0,
    ...overrides,
  }
}

describe('computeRoomCheckInState', () => {
  it('当日CI予約がある場合、isTodayCheckIn=true になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: TARGET_DATE, check_out_date: '2026-04-02' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isTodayCheckIn).toBe(true)
    expect(result.isFutureCheckIn).toBe(false)
    expect(result.checkInReservation).toMatchObject({ adult_count: 2, child_count: 0 })
  })

  it('未来CI予約がある場合、isFutureCheckIn=true になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-04-03', check_out_date: '2026-04-05' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isTodayCheckIn).toBe(false)
    expect(result.isFutureCheckIn).toBe(true)
    expect(result.checkInReservation).toMatchObject({ adult_count: 2, child_count: 0 })
  })

  it('滞在継続中（CO日 > targetDate+1）の場合、checkInReservation=null になる', () => {
    // CI: 3/31, CO: 4/3 → targetDate(4/1)をまたぎ、翌日(4/2)も継続
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-03' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.stayingReservation).not.toBeNull()
    expect(result.isStayingContinued).toBe(true)
    expect(result.checkInReservation).toBeNull()
    expect(result.isTodayCheckIn).toBe(false)
    expect(result.isFutureCheckIn).toBe(false)
  })

  it('最終夜（CO日 = targetDate+1）の場合、翌日のCI予約がcheckInReservationに入る', () => {
    // 昨夜からのゲスト: CI: 3/31, CO: 4/2（明朝チェックアウト）
    // 次のゲスト: CI: 4/2, CO: 4/3
    const reservations: Reservation[] = [
      makeReservation({ id: 'r1', check_in_date: '2026-03-31', check_out_date: '2026-04-02' }),
      makeReservation({ id: 'r2', check_in_date: '2026-04-02', check_out_date: '2026-04-03', adult_count: 3 }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.stayingReservation?.id).toBe('r1')
    expect(result.isStayingContinued).toBe(false)
    expect(result.checkInReservation).toMatchObject({ adult_count: 3 })
    expect(result.isTodayCheckIn).toBe(false)
    expect(result.isFutureCheckIn).toBe(true)
  })

  it('cancel=1 の予約は除外される', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: TARGET_DATE, cancel: 1 }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.checkInReservation).toBeNull()
    expect(result.isTodayCheckIn).toBe(false)
  })

  it('複数の未来CI予約がある場合、最も近い日付のものが checkInReservation になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ id: 'far',  check_in_date: '2026-04-10', check_out_date: '2026-04-12', adult_count: 4 }),
      makeReservation({ id: 'near', check_in_date: '2026-04-05', check_out_date: '2026-04-07', adult_count: 2 }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.checkInReservation).toMatchObject({ adult_count: 2 })
    expect(result.isFutureCheckIn).toBe(true)
  })

  it('別の部屋の予約は影響しない', () => {
    const reservations: Reservation[] = [
      makeReservation({ room: '22', check_in_date: TARGET_DATE }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.checkInReservation).toBeNull()
    expect(result.isTodayCheckIn).toBe(false)
  })

// ----- 連泊(isConsecutiveCheckIn=Trueの時は「連泊」列に人数を表示する) ---------

  it('1泊のCI予約は isConsecutiveCheckIn=false になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: TARGET_DATE, check_out_date: '2026-04-02' }), // 1泊
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isConsecutiveCheckIn).toBe(false)
  })

  it('2泊のCI予約は isConsecutiveCheckIn=true になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: TARGET_DATE, check_out_date: '2026-04-03' }), // 2泊
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isConsecutiveCheckIn).toBe(true)
  })

  it('4泊のCI予約は isConsecutiveCheckIn=true になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: TARGET_DATE, check_out_date: '2026-04-05' }), // 4泊
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isConsecutiveCheckIn).toBe(true)
  })

  it('CI予約がない場合は isConsecutiveCheckIn=false になる', () => {
    const result = computeRoomCheckInState([], TARGET_DATE, '21')

    expect(result.isConsecutiveCheckIn).toBe(false)
  })

  it('滞在継続中（isStayingContinued=true）の場合は isConsecutiveCheckIn=false になる', () => {
    // CI: 3/31, CO: 4/3 → 翌日(4/2)も継続 → isStayingContinued=true → checkInReservation=null
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-03' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isStayingContinued).toBe(true)
    expect(result.isConsecutiveCheckIn).toBe(false)
  })

  it('未来CIが2泊以上の場合は isConsecutiveCheckIn=true になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-04-05', check_out_date: '2026-04-07' }), // 2泊
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isFutureCheckIn).toBe(true)
    expect(result.isConsecutiveCheckIn).toBe(true)
  })
})

// ----- isLastNight -----

describe('isLastNight', () => {
  it('stayingReservation の CO日 === targetDate+1 なら true になる', () => {
    // CI: 3/31, CO: 4/2 → 今夜が最終泊
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-02' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isLastNight).toBe(true)
  })

  it('stayingReservation の CO日 > targetDate+1 なら false になる（連泊継続中）', () => {
    // CI: 3/31, CO: 4/3 → まだ継続
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-03' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isLastNight).toBe(false)
  })

  it('stayingReservation がなければ false になる', () => {
    const result = computeRoomCheckInState([], TARGET_DATE, '21')

    expect(result.isLastNight).toBe(false)
  })
})

// ----- isLateCheckout -----

describe('isLateCheckout', () => {
  it('isLastNight かつ late_out=1 なら true になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-02', late_out: 1 }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isLastNight).toBe(true)
    expect(result.isLateCheckout).toBe(true)
  })

  it('isLastNight かつ late_out=0 なら false になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-02', late_out: 0 }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isLastNight).toBe(true)
    expect(result.isLateCheckout).toBe(false)
  })

  it('isLastNight かつ late_out が undefined なら false になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-02' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isLastNight).toBe(true)
    expect(result.isLateCheckout).toBe(false)
  })

  it('isLastNight でなければ late_out=1 でも false になる', () => {
    // 連泊継続中（isLastNight=false）
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-03', late_out: 1 }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isLastNight).toBe(false)
    expect(result.isLateCheckout).toBe(false)
  })
})

// ----- isTodayVacant -----

describe('isTodayVacant', () => {
  it('stayingReservation なし かつ isTodayCheckIn=false なら true になる', () => {
    const result = computeRoomCheckInState([], TARGET_DATE, '21')

    expect(result.isTodayVacant).toBe(true)
  })

  it('stayingReservation があれば false になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-03' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isTodayVacant).toBe(false)
  })

  it('当日CI があれば false になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: TARGET_DATE, check_out_date: '2026-04-02' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isTodayCheckIn).toBe(true)
    expect(result.isTodayVacant).toBe(false)
  })
})

// ----- isPreviousDayVacant -----

describe('isPreviousDayVacant', () => {
  it('前日に有効な滞在予約がなければ true になる', () => {
    // 当日CIのみ（昨日は誰もいない）
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: TARGET_DATE, check_out_date: '2026-04-02' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isPreviousDayVacant).toBe(true)
  })

  it('滞在継続中のゲストがいれば false になる（昨日も泊まっている）', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: '2026-04-03' }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isPreviousDayVacant).toBe(false)
  })

  it('今朝COの予約（check_out_date === targetDate）があれば false になる（昨日は泊まっていた）', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: TARGET_DATE }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isPreviousDayVacant).toBe(false)
  })

  it('予約がまったくなければ true になる', () => {
    const result = computeRoomCheckInState([], TARGET_DATE, '21')

    expect(result.isPreviousDayVacant).toBe(true)
  })

  it('cancel=1 の昨日泊まっていた予約は除外されるため true になる', () => {
    const reservations: Reservation[] = [
      makeReservation({ check_in_date: '2026-03-31', check_out_date: TARGET_DATE, cancel: 1 }),
    ]
    const result = computeRoomCheckInState(reservations, TARGET_DATE, '21')

    expect(result.isPreviousDayVacant).toBe(true)
  })
})
