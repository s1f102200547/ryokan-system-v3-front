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

// --- 縮めた分の記憶 ---
// C/O 日を1文字ずつ打つと、入力途中の短い泊数で配列が切り詰められる。
// モーダルを開いている間は、いちばん長かったときの値を覚えておき、伸ばし直したときに戻す。

export type ArrayFieldMemory = Required<NightFields> & { age_groups: (string | null)[] }

// 編集後の配列で先頭を上書きし、それより後ろは覚えていた値を残す
export function keepLonger<T>(memory: T[], edited: T[]): T[] {
  return [...edited, ...memory.slice(edited.length)]
}

export function rememberArrayFields(memory: ArrayFieldMemory, patch: ReservationPatch): ArrayFieldMemory {
  return {
    dinner_time:        patch.dinner_time        ? keepLonger(memory.dinner_time, patch.dinner_time) : memory.dinner_time,
    dinner_info:        patch.dinner_info        ? keepLonger(memory.dinner_info, patch.dinner_info) : memory.dinner_info,
    breakfast_time:     patch.breakfast_time     ? keepLonger(memory.breakfast_time, patch.breakfast_time) : memory.breakfast_time,
    open_air_bath_time: patch.open_air_bath_time ? keepLonger(memory.open_air_bath_time, patch.open_air_bath_time) : memory.open_air_bath_time,
    timetable_info:     patch.timetable_info     ? keepLonger(memory.timetable_info, patch.timetable_info) : memory.timetable_info,
    age_groups:         patch.age_groups         ? keepLonger(memory.age_groups, patch.age_groups) : memory.age_groups,
  }
}
