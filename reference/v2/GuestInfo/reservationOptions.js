// src/constants/reservationOptions.js
import countries from 'world-countries';
import {
  DINNER_NONE,
  DINNER_CANCEL,
  DINNER_PENDING,
  DINNER_CLOCK_TIMES,
} from './dinnerTime';

const countryLabelOverrides = {
  TW: '台湾', // デフォルトの「中華民国」を上書き
};

const priorityCountryCodes = [
  'US', // アメリカ合衆国
  'FR', // フランス
  'JP', // 日本
  'GB', // イギリス
  'IT', // イタリア
  'KR', // 韓国
  'CA', // カナダ
  'CN', // 中国
  'DE', // ドイツ
  'ES', // スペイン
  'CH', // スイス
  'AU', // オーストラリア
  'PL', // ポーランド
  'RO', // ルーマニア
  'RU', // ロシア
  'AT', // オーストリア
  'BE', // ベルギー
  'DK', // デンマーク
  'NZ', // ニュージーランド
  'BR', // ブラジル
  'SG', // シンガポール
  'NL', // オランダ
  'NO', // ノルウェー
  'SA', // サウジアラビア
  'TW', // 台湾
  'MX', // メキシコ
  'ZA', // 南アフリカ
  'AR', // アルゼンチン
  'FI', // フィンランド
  'HK', // 香港
  'HR', // クロアチア
  'ID', // インドネシア
  'IE', // アイルランド
  'IL', // イスラエル
  'IN', // インド
  'LV', // ラトビア
  'MY', // マレーシア
  'PH', // フィリピン
  'PT', // ポルトガル
  'SK', // スロバキア
  'TH', // タイ
];


const mappedCountries = countries
  .map(c => {
    const value = c.cca2;
    const defaultLabel = c.translations.jpn?.common || c.name.common;
    const label = countryLabelOverrides[value] || defaultLabel;
    return { value, label };
  })
  .sort((a, b) => a.label.localeCompare(b.label, 'ja'));

const prioritySet = new Set(priorityCountryCodes);
const prioritizedCountries = priorityCountryCodes
  .map(code => mappedCountries.find(country => country.value === code))
  .filter(Boolean);

const remainingCountries = mappedCountries.filter(
  country => !prioritySet.has(country.value)
);

export const countryOptions = [
  { value: '', label: '不明' },
  ...prioritizedCountries,
  ...remainingCountries,
];

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
  { value: '22:00', label: '22:00' }
];

export const rotenOptions = [
  { value: '16:00', label: '16:00' },
  { value: '17:00', label: '17:00' },
  { value: '18:00', label: '18:00' },
  { value: '19:00', label: '19:00' },
  { value: '20:00', label: '20:00' },
  { value: '21:00', label: '21:00' },
  { value: '22:00', label: '22:00' },
  { value: '7:30',  label: '7:30' },
  { value: '8:00',  label: '8:00' },
  { value: '8:30',  label: '8:30' },
  { value: '9:00',  label: '9:00' },
  { value: '9:30',  label: '9:30' }
];

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
  { value: '9:30b', label: '9:30b' }
];

export const lateCOOptions = [
  { value: 1, label: 'あり' },
  { value: 0, label: 'なし' }
];

export const dinnerTimeOptions = [
  { value: DINNER_NONE, label: 'なし' },
  { value: DINNER_PENDING, label: '時間未定' },
  ...DINNER_CLOCK_TIMES.map((time) => ({ value: time, label: time })),
  { value: DINNER_CANCEL, label: 'キャンセル' },
];

export const groupOptions = [
  { value: '',            label: '不明'       },
  { value: 'couple',      label: 'カップル'  },
  { value: 'married',     label: '夫婦'      },
  { value: 'parent_child',label: '親子'  },
  { value: 'friends',     label: '友達'      },
  { value: 'coworker',    label: '同僚'      },
  { value: 'other',       label: 'その他'    }
];

export const purposeOptions = [
  { value: '',        label: '不明'       },
  { value: 'tourism', label: '観光'       },
  { value: 'business',label: 'ビジネス'   }
];

export const tourismOptions = [
  { value: '',           label: '未選択'     },
  { value: 'normal',     label: '普通の観光' },
  { value: 'honeymoon',  label: 'ハネムーン' },
  { value: 'birthday',   label: '誕生日'     },
  { value: 'anniversary',label: '結婚記念日' }
];

export const ageOptions = [
  { value: '',    label: '未選択' },
  { value: '~10', label: '〜10歳' },
  { value: '10s', label: '10代'   },
  { value: '20s', label: '20代'   },
  { value: '30s', label: '30代'   },
  { value: '40s', label: '40代'   },
  { value: '50s', label: '50代'   },
  { value: '60s', label: '60代'   },
  { value: '70~', label: '70代〜' }
];
