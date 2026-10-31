// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { toReservation } from '@/infra/reservation/firestoreReservationRepository'
import { InfraError } from '@/types/errors'

const base = {
  check_in_date: '2026/11/10',
  check_out_date: '2026/11/12',
  adult_count: 2,
  child_count: 0,
  room: '21',
  cancel: 0,
}

function corruptionCode(data: Record<string, unknown>): string | undefined {
  try {
    toReservation('doc1', data)
    return undefined
  } catch (e) {
    return e instanceof InfraError ? e.code : `not InfraError: ${String(e)}`
  }
}

describe('toReservation（泊数）', () => {
  it('2泊なら泊別配列は2泊分になる', () => {
    const r = toReservation('doc1', base)
    expect(r.dinner_time).toHaveLength(2)
    expect(r.timetable_info).toHaveLength(2)
  })

  // BugHunting.md #4: 泊数が負だと Array(nights) が RangeError を投げ、範囲取得全体が落ちていた
  it('C/O が C/I より前（泊数が負）は FIRESTORE_DATA_CORRUPTION', () => {
    expect(corruptionCode({ ...base, check_out_date: '2026/11/09' })).toBe('FIRESTORE_DATA_CORRUPTION')
  })

  it('C/O が C/I と同日（泊数 0）は FIRESTORE_DATA_CORRUPTION', () => {
    expect(corruptionCode({ ...base, check_out_date: '2026/11/10' })).toBe('FIRESTORE_DATA_CORRUPTION')
  })

  // BugHunting.md #12: 31 泊以上は破損として読み飛ばす（入口でも拒否している）
  it('30 泊は正常に読める', () => {
    expect(corruptionCode({ ...base, check_out_date: '2026/12/10' })).toBeUndefined()
  })

  it('31 泊は FIRESTORE_DATA_CORRUPTION', () => {
    expect(corruptionCode({ ...base, check_out_date: '2026/12/11' })).toBe('FIRESTORE_DATA_CORRUPTION')
  })

  it('1泊は正常に読める', () => {
    expect(corruptionCode({ ...base, check_out_date: '2026/11/11' })).toBeUndefined()
  })
})
