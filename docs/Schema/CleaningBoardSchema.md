# Firestore Schema

## 1. 予約コレクション
  
**クエリキー**:  
```ts
check_in_date == "YYYY/MM/DD"
````

---

### フィールド定義

| フィールド名         | 型                     | 説明                         | CleaningBoardでの用途   |
| -------------- | --------------------- | -------------------------- | ------------------- |
| id             | string                | ドキュメントID（予約ID）             | エラー識別               |
| check_in_date  | string ("YYYY/MM/DD") | チェックイン日                    | クエリキー、連泊判定          |
| check_out_date | string ("YYYY/MM/DD") | チェックアウト日                   | 連泊判定・レイトアウト表示       |
| room           | string                | 部屋番号（21/22/31/32/42/43/61） | 部屋行への振り分け           |
| adult_count    | number                | 大人人数                       | C/I列・連泊列の人数表示       |
| child_count    | number                | 子供人数                       | C/I列・連泊列の人数表示（括弧付き） |
| late_out       | boolean               | レイトアウト有無                   | NotesSection の備考欄   |
| cancel         | number (0 | 1)        | キャンセルフラグ                   | 1 のレコードは除外          |
| guest_name     | string                | ゲスト名                       | 無効エントリのエラーメッセージのみ   |

---

## 2. 日次コレクション

* `CleaningBoard`では `dateDocRef` の参照定義のみ存在
* **直接の読み書きは行わない（他画面用）**

---

## 3. 正規化後の計算フィールド（DB非保存）

| フィールド名                       | 算出方法                                     | CleaningBoardでの用途 |
| ---------------------------- | ---------------------------------------- | ----------------- |
| nights                       | `check_out_date - check_in_date` の日数     | 連泊判定（2泊以上で「連」表示）  |
| tax                          | `adult_count × nights × 200`             | 未使用               |
| a_tax_received               | `raw.a_tax_received ?? false`            | 未使用               |
| a_tax_received_by_staff_name | `raw.a_tax_received_by_staff_name ?? ''` | 未使用               |
| safeBalanceChecker           | `raw.safeBalanceChecker ?? ''`           | 未使用               |

---
```
