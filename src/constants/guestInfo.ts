import countries from 'world-countries'
import type { BookingSite } from '@/types/guestInfo'

export const A_TAX_RATE_PER_PERSON_PER_NIGHT = 200 // ¥/人/泊（実装前に確認すること）

// --- Dinner ---
export const DINNER_NONE = 'NONE'
export const DINNER_CANCEL = 'CANCEL'
export const DINNER_PENDING = 'PENDING'
export const DINNER_CLOCK_TIMES = ['17:30', '18:00', '18:30', '19:00', '19:30', '20:00'] as const

// 1件の予約の泊数の上限。画面の取得窓（対象日の前後 30 日の C/I）を超える滞在は表示されないため（BugHunting.md #12）
export const MAX_NIGHTS = 30

// --- 予約の書き込みの上限（T7-4） ---
// PATCH /api/reservations/[id] の Zod と、画面の入力欄の maxLength が共通で参照する。読み取り（Infra）には使わない。
// Zod 4 の .max() はコードポイントで、HTML の maxLength は UTF-16 の length で数える。UTF-16 の方が長く数えるので、
// 画面で入力できる値は必ず Zod を通る。
// 値は本番データの最大（2026-11-02 の匿名化の大きさのレポート。括弧内）の約 2〜5 倍。すべて上限でも1件は約 0.8 MB
// （1文字 4 バイトで計算）で、Firestore の 1 MiB に収まる
export const MAX_ADULT_COUNT = 9
export const RESERVATION_LIMITS = {
  otherNoteLength: 2000,      // other_note（337）
  professionLength: 100,      // profession（12）
  selectValueLength: 50,      // group_type / purpose / tourism_type / age_groups の要素（12）
  dinnerInfoLength: 100,      // dinner_info の要素（7）
  timetableInfoLength: 500,   // timetable_info の要素（109）
  mailMemoItems: 100,         // mail_memo の件数（19）。キャンセル・復活のたびに1件増える
  mailMemoMonthDayLength: 2,  // mail_memo の month / day（2）
  mailMemoNameLength: 100,    // mail_memo の name（13）。キャンセル・復活の staff_name の上限と同じ
  mailMemoSummaryLength: 500, // mail_memo の summary（258）
  mailMemoTextLength: 1000,   // mail_memo の text（334）。キャンセル・復活の reason（最大 500）が入る
  mailMemoSourceLength: 50,   // mail_memo の source（10）
} as const

// --- 予約フィールドの許容値 ---
// Route の入口検証と Infra の読み取り検証が共通で参照する（BugHunting.md R1）。
// 読み取りで fallback に置き換えられる値を、書き込みで受け付けないようにするため

// 6:00は許容しない。0 padding想定。
export const ARRIVAL_TIME_VALUES = [
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00',
  '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
] as const

export const DINNER_TIME_VALUES = [DINNER_NONE, DINNER_CANCEL, DINNER_PENDING, ...DINNER_CLOCK_TIMES] as const

export const BREAKFAST_TIME_VALUES = [
  '7:30a', '8:00a', '9:00a', '8:30a', '9:30a',
  '7:30b', '8:00b', '9:00b', '8:30b', '9:30b',
] as const

export const OPEN_AIR_BATH_TIME_VALUES = [
  // 夕方
  '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00',
  // 朝
  '7:30', '8:00', '8:30', '9:00', '9:30',
] as const

// --- Select options ---

export const arrivalOptions = [
  { value: '06:00', label: '06:00' },
  { value: '07:00', label: '07:00' },
  { value: '08:00', label: '08:00' },
  { value: '09:00', label: '09:00' },
  { value: '10:00', label: '10:00' },
  { value: '11:00', label: '11:00' },
  { value: '12:00', label: '12:00' },
  { value: '13:00', label: '13:00' },
  { value: '14:00', label: '14:00' },
  { value: '15:00', label: '15:00' },
  { value: '16:00', label: '16:00' },
  { value: '17:00', label: '17:00' },
  { value: '18:00', label: '18:00' },
  { value: '19:00', label: '19:00' },
  { value: '20:00', label: '20:00' },
  { value: '21:00', label: '21:00' },
  { value: '22:00', label: '22:00' },
]

export const rotenOptions = [
  { value: '16:00', label: '16:00' },
  { value: '17:00', label: '17:00' },
  { value: '18:00', label: '18:00' },
  { value: '19:00', label: '19:00' },
  { value: '20:00', label: '20:00' },
  { value: '21:00', label: '21:00' },
  { value: '22:00', label: '22:00' },
  { value: '7:30',  label: '7:30'  },
  { value: '8:00',  label: '8:00'  },
  { value: '8:30',  label: '8:30'  },
  { value: '9:00',  label: '9:00'  },
  { value: '9:30',  label: '9:30'  },
]

export const breakfastOptions = [
  { value: '7:30a', label: '7:30a' },
  { value: '7:30b', label: '7:30b' },
  { value: '8:00a', label: '8:00a' },
  { value: '8:00b', label: '8:00b' },
  { value: '8:30a', label: '8:30a' },
  { value: '8:30b', label: '8:30b' },
  { value: '9:00a', label: '9:00a' },
  { value: '9:00b', label: '9:00b' },
  { value: '9:30a', label: '9:30a' },
  { value: '9:30b', label: '9:30b' },
]

export const dinnerTimeOptions = [
  { value: DINNER_NONE,    label: 'なし'   },
  { value: DINNER_PENDING, label: '時間未定' },
  ...DINNER_CLOCK_TIMES.map((t) => ({ value: t, label: t })),
  { value: DINNER_CANCEL,  label: 'キャンセル' },
]

// 大人・子供の人数（0〜9）
export const countOptions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ value: n, label: String(n) }))

export const bookingSiteOptions: { value: BookingSite; label: string }[] = [
  { value: 'chillnn',     label: 'Chillnn（A税不要）' },
  { value: 'booking.com', label: 'Booking.com' },
  { value: 'expedia',     label: 'Expedia' },
  { value: 'other',       label: 'その他' },
]

export const lateCOOptions = [
  { value: 1, label: 'あり' },
  { value: 0, label: 'なし' },
]

export const groupOptions = [
  { value: '',             label: '不明'    },
  { value: 'couple',       label: 'カップル' },
  { value: 'married',      label: '夫婦'    },
  { value: 'parent_child', label: '親子'    },
  { value: 'friends',      label: '友達'    },
  { value: 'coworker',     label: '同僚'    },
  { value: 'other',        label: 'その他'  },
]

export const purposeOptions = [
  { value: '',         label: '不明'     },
  { value: 'tourism',  label: '観光'     },
  { value: 'business', label: 'ビジネス' },
]

export const tourismOptions = [
  { value: '',            label: '未選択'     },
  { value: 'normal',      label: '普通の観光' },
  { value: 'honeymoon',   label: 'ハネムーン' },
  { value: 'birthday',    label: '誕生日'     },
  { value: 'anniversary', label: '結婚記念日' },
]

export const ageOptions = [
  { value: '',    label: '未選択' },
  { value: '~10', label: '〜10歳' },
  { value: '10s', label: '10代'   },
  { value: '20s', label: '20代'   },
  { value: '30s', label: '30代'   },
  { value: '40s', label: '40代'   },
  { value: '50s', label: '50代'   },
  { value: '60s', label: '60代'   },
  { value: '70~', label: '70代〜' },
]

const countryLabelOverrides: Record<string, string> = {
  TW: '台湾',
}

const priorityCountryCodes = [
  'US', 'FR', 'JP', 'GB', 'IT', 'KR', 'CA', 'CN', 'DE', 'ES',
  'CH', 'AU', 'PL', 'RO', 'RU', 'AT', 'BE', 'DK', 'NZ', 'BR',
  'SG', 'NL', 'NO', 'SA', 'TW', 'MX', 'ZA', 'AR', 'FI', 'HK',
  'HR', 'ID', 'IE', 'IL', 'IN', 'LV', 'MY', 'PH', 'PT', 'SK', 'TH',
]

const mappedCountries = countries
  .map((c) => {
    const value = c.cca2
    const defaultLabel = c.translations.jpn?.common ?? c.name.common
    const label = countryLabelOverrides[value] ?? defaultLabel
    return { value, label }
  })
  .sort((a, b) => a.label.localeCompare(b.label, 'ja'))

const prioritySet = new Set(priorityCountryCodes)
const prioritizedCountries = priorityCountryCodes
  .map((code) => mappedCountries.find((c) => c.value === code))
  .filter((c): c is { value: string; label: string } => c !== undefined)
const remainingCountries = mappedCountries.filter((c) => !prioritySet.has(c.value))

export const countryOptions = [
  { value: '', label: '不明' },
  ...prioritizedCountries,
  ...remainingCountries,
]
