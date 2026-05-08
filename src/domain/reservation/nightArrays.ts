import { DINNER_NONE } from '@/constants/guestInfo'
import type { ReservationPatch } from '@/types/guestInfo'

export function resizeNightArray<T>(arr: T[], newNights: number, defaultValue: T): T[] {
  if (arr.length === newNights) return arr
  if (arr.length > newNights) return arr.slice(0, newNights)
  return [...arr, ...Array<T>(newNights - arr.length).fill(defaultValue)]
}

type NightFields = Pick<
  ReservationPatch,
  'dinner_time' | 'dinner_info' | 'breakfast_time' | 'open_air_bath_time' | 'timetable_info'
>

// check_out_date変更時に夜数連動フィールドをまとめてリサイズする
export function resizeNightFields(fields: NightFields, newNights: number): Required<NightFields> {
  return {
    dinner_time:        resizeNightArray(fields.dinner_time        ?? [], newNights, DINNER_NONE),
    dinner_info:        resizeNightArray(fields.dinner_info        ?? [], newNights, ''),
    breakfast_time:     resizeNightArray(fields.breakfast_time     ?? [], newNights, null),
    open_air_bath_time: resizeNightArray(fields.open_air_bath_time ?? [], newNights, null),
    timetable_info:     resizeNightArray(fields.timetable_info     ?? [], newNights, ''),
  }
}
