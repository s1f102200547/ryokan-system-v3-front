// 匿名化の許可リスト
// ここに列挙したパスだけが「残す / ID として振り直す / シャッフル」になり、それ以外は未知のフィールドも含めてすべてマスクする。
// パスはコレクション内の相対パス。マップの中は `.`、配列の各要素は `[]` でつなぐ（例: `mail_memo[].source`）

export type Treatment = 'keep' | 'id' | 'shuffle' | 'mask'

export type AnonymizedCollection = 'guestInfoV2' | 'dailyInfo'

type CollectionRule = {
  docId: 'keep' | 'id'
  keep: readonly string[]
  id: readonly string[]
  shuffle: readonly string[]
}

export const ALLOWLIST: Record<AnonymizedCollection, CollectionRule> = {
  guestInfoV2: {
    docId: 'id',
    keep: [
      'check_in_date', 'check_out_date', 'room', 'adult_count', 'child_count', 'room_count',
      'cancel', 'late_out', 'booking_site', 'room_type', 'stay_plan', 'total_price', 'source',
      'arrival_time', 'dinner_time', 'breakfast_time', 'open_air_bath_time',
      'group_type', 'purpose', 'tourism_type', 'age_groups', 'a_tax_received',
      'mail_memo[].month', 'mail_memo[].day', 'mail_memo[].source',
    ],
    id: ['reservation_number', 'mail_id'],
    shuffle: ['country'],
  },
  dailyInfo: {
    docId: 'keep',
    keep: ['date', 'updated_at', 'migrated_at', 'source.collection', 'source.field'],
    id: ['todos[].id'],
    shuffle: [],
  },
}

// デフォルト拒否: 列挙されていないパスはマスク
export function treatmentOf(collection: AnonymizedCollection, path: string): Treatment {
  const rule = ALLOWLIST[collection]
  if (rule.keep.includes(path)) return 'keep'
  if (rule.id.includes(path)) return 'id'
  if (rule.shuffle.includes(path)) return 'shuffle'
  return 'mask'
}

export function childPath(parent: string, key: string): string {
  return parent === '' ? key : `${parent}.${key}`
}

export function elementPath(parent: string): string {
  return `${parent}[]`
}
