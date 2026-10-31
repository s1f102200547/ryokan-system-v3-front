import { dateDiff } from '@/lib/dateUtils'
import { MAX_NIGHTS } from '@/constants/guestInfo'
import type { Result } from '@/types/result'
import type { ReservationPatch, ReservationPatchViolation, StayFacts } from '@/types/guestInfo'

const NIGHT_FIELDS = [
  'dinner_time', 'dinner_info', 'breakfast_time', 'open_air_bath_time', 'timetable_info',
] as const satisfies ReadonlyArray<keyof ReservationPatch>

/**
 * 予約の部分更新が、DB の今の値と合わせて整合するかを検査する。
 * Infra は読み取り時に、泊別配列の長さが泊数と違うと全泊分を初期化し、泊数が 0 以下の予約を破損として読み飛ばす。
 * 保存は成功したのに読み戻すと消える、を防ぐため、同じ条件を書き込みの入口で拒否する。
 *
 * - 更新後の C/O は C/I より後（泊数 1 以上）、泊数は MAX_NIGHTS 以下
 * - 泊数が変わるなら、泊別配列は5つすべてを送る。送った配列の長さは更新後の泊数
 * - 大人の人数が変わるなら age_groups も送る。age_groups の長さは更新後の大人の人数
 */
export function validateReservationPatch(
  current: StayFacts,
  patch: ReservationPatch,
): Result<void, ReservationPatchViolation[]> {
  const violations: ReservationPatchViolation[] = []

  const nights = dateDiff(current.check_in_date, patch.check_out_date ?? current.check_out_date)
  if (nights < 1) {
    violations.push({ code: 'CHECK_OUT_NOT_AFTER_CHECK_IN', field: 'check_out_date' })
  } else if (nights > MAX_NIGHTS) {
    violations.push({ code: 'TOO_MANY_NIGHTS', field: 'check_out_date' })
  } else {
    const currentNights = dateDiff(current.check_in_date, current.check_out_date)
    if (nights !== currentNights && NIGHT_FIELDS.some((f) => patch[f] === undefined)) {
      violations.push({ code: 'NIGHT_FIELDS_REQUIRED' })
    }
    for (const field of NIGHT_FIELDS) {
      const value = patch[field]
      if (value !== undefined && value.length !== nights) {
        violations.push({ code: 'NIGHT_FIELD_LENGTH_MISMATCH', field })
      }
    }
  }

  const adultCount = patch.adult_count ?? current.adult_count
  if (patch.age_groups === undefined) {
    if (adultCount !== current.adult_count) {
      violations.push({ code: 'AGE_GROUPS_REQUIRED', field: 'age_groups' })
    }
  } else if (patch.age_groups.length !== adultCount) {
    violations.push({ code: 'AGE_GROUPS_LENGTH_MISMATCH', field: 'age_groups' })
  }

  return violations.length === 0 ? { success: true, value: undefined } : { success: false, error: violations }
}
