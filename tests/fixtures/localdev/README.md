# ローカル開発用 fixture

`npm run seed -- --fixture` で Firebase Emulator に投入する人工データ。実在の顧客・スタッフとは関係ない。

保存形式は `scripts/localdev/lib/serialize.ts`（タグ付き JSON）。本番データの「形」（`docs/LocalDevelopment.md` §1）をわざと含める:

- 整数は `{ "$t": "int" }`（integerValue）、素の JSON の数値は小数（doubleValue）
- `room` の `""` / `null` / 欠損、`country` の `""` / `null`、`a_tax_received` の `true` と `1`
- 破損日付（`check_in_date` の `YYYY-MM-DD`、`dailyInfo/2026-13-99`）、`adult_count` の型違い（読み取り時に skip される）
- 泊別配列の長さ違い・配列でない値・範囲外の値（読み取り時に fallback で補完される）
- `NaN`、Timestamp、未知のフィールド、アプリの表示範囲外の過去日
