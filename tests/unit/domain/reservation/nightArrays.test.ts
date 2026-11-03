import { describe, it, expect } from 'vitest'
import { keepLonger, rememberArrayFields, resizeNightArray, resizeNightFields } from '@/domain/reservation/nightArrays'
import type { ArrayFieldMemory } from '@/domain/reservation/nightArrays'
import { DINNER_NONE } from '@/constants/guestInfo'

describe('resizeNightArray', () => {
  it('同じ長さのとき変更なし', () => {
    expect(resizeNightArray(['a', 'b', 'c'], 3, 'x')).toEqual(['a', 'b', 'c'])
  })

  it('3泊 → 5泊: 末尾にデフォルト値を追加', () => {
    expect(resizeNightArray(['a', 'b', 'c'], 5, 'x')).toEqual(['a', 'b', 'c', 'x', 'x'])
  })

  it('5泊 → 3泊: 末尾を削除', () => {
    expect(resizeNightArray(['a', 'b', 'c', 'd', 'e'], 3, 'x')).toEqual(['a', 'b', 'c'])
  })

  it('0泊: 空配列', () => {
    expect(resizeNightArray(['a', 'b'], 0, 'x')).toEqual([])
  })

  it('空配列 → 2泊: デフォルト値で埋める', () => {
    expect(resizeNightArray([], 2, null)).toEqual([null, null])
  })
})

describe('resizeNightFields', () => {
  it('泊数が増えたとき各フィールドの末尾にデフォルト値を追加', () => {
    const fields = {
      dinner_time: [DINNER_NONE],
      dinner_info: [''],
      breakfast_time: [null] as (string | null)[],
      open_air_bath_time: [null] as (string | null)[],
      timetable_info: ['memo'],
    }
    const result = resizeNightFields(fields, 2)
    expect(result.dinner_time).toEqual([DINNER_NONE, DINNER_NONE])
    expect(result.dinner_info).toEqual(['', ''])
    expect(result.breakfast_time).toEqual([null, null])
    expect(result.open_air_bath_time).toEqual([null, null])
    expect(result.timetable_info).toEqual(['memo', ''])
  })

  it('泊数が減ったとき末尾を削除', () => {
    const fields = {
      dinner_time: [DINNER_NONE, DINNER_NONE, DINNER_NONE],
      dinner_info: ['', '', ''],
      breakfast_time: [null, '7:30a', null] as (string | null)[],
      open_air_bath_time: [null, null, null] as (string | null)[],
      timetable_info: ['a', 'b', 'c'],
    }
    const result = resizeNightFields(fields, 2)
    expect(result.dinner_time).toHaveLength(2)
    expect(result.timetable_info).toEqual(['a', 'b'])
  })

  it('undefined フィールドはデフォルト配列で補完', () => {
    const result = resizeNightFields({}, 2)
    expect(result.dinner_time).toEqual([DINNER_NONE, DINNER_NONE])
    expect(result.breakfast_time).toEqual([null, null])
  })
})

// C/O 日を1文字ずつ打つと、途中の短い泊数で入力が消えていた
describe('keepLonger', () => {
  it('編集後の配列で先頭を上書きし、それより後ろは覚えていた値を残す', () => {
    expect(keepLonger(['a', 'b', 'c'], ['x'])).toEqual(['x', 'b', 'c'])
  })

  it('編集後の配列の方が長ければ、それをそのまま使う', () => {
    expect(keepLonger(['a'], ['x', 'y', 'z'])).toEqual(['x', 'y', 'z'])
  })
})

describe('rememberArrayFields', () => {
  const memory: ArrayFieldMemory = {
    dinner_time: [DINNER_NONE, '18:00'],
    dinner_info: ['', ''],
    breakfast_time: [null, '8:00a'],
    open_air_bath_time: [null, null],
    timetable_info: ['night1', 'night2'],
    age_groups: ['20s', '30s', '40s'],
  }

  it('patch に含まれない配列はそのまま', () => {
    expect(rememberArrayFields(memory, { guest_name: 'x' })).toEqual(memory)
  })

  it('patch の配列は keepLonger で取り込む', () => {
    const result = rememberArrayFields(memory, { timetable_info: ['edited'], age_groups: [null] })
    expect(result.timetable_info).toEqual(['edited', 'night2'])
    expect(result.age_groups).toEqual([null, '30s', '40s'])
  })

  it('2泊 → 1泊 → 15泊と変えても、2泊目の入力が戻る', () => {
    const oneNight = resizeNightFields(memory, 1)
    const remembered = rememberArrayFields(memory, oneNight)
    const fifteen = resizeNightFields(remembered, 15)
    expect(fifteen.dinner_time.slice(0, 3)).toEqual([DINNER_NONE, '18:00', DINNER_NONE])
    expect(fifteen.timetable_info.slice(0, 3)).toEqual(['night1', 'night2', ''])
    expect(fifteen.timetable_info).toHaveLength(15)
  })

  it('大人 3人 → 1人 → 3人と変えても、年代が戻る', () => {
    const one = resizeNightArray(memory.age_groups, 1, null)
    const remembered = rememberArrayFields(memory, { adult_count: 1, age_groups: one })
    expect(resizeNightArray(remembered.age_groups, 3, null)).toEqual(['20s', '30s', '40s'])
  })
})
