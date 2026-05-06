import countries from 'world-countries'

export const A_TAX_RATE_PER_PERSON_PER_NIGHT = 200 // ¥/人/泊（実装前に確認すること）

// --- Dinner ---
export const DINNER_NONE = 'NONE'
export const DINNER_CANCEL = 'CANCEL'
export const DINNER_PENDING = 'PENDING'
export const DINNER_CLOCK_TIMES = ['17:30', '18:00', '18:30', '19:00', '19:30', '20:00'] as const

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
