import { describe, it, expect } from 'vitest'
import { resizeNightArray, resizeNightFields } from './nightArrays'
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
