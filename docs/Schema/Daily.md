
# Daily Schema

## `dailyInfo` コレクション

日次データ。ドキュメントIDは対象日（`YYYY-MM-DD`）。

**クエリキー例:**
```ts
doc("dailyInfo/2026-03-31")
```

### フィールド定義

| フィールド | 型 | 必須/任意 | 制約 | 説明 |
|---|---|---|---|---|
| date | string | 必須 | `YYYY-MM-DD` 形式 | ドキュメントIDと同じ日付 |
| todos | `{ id: string; text: string }[]` | 任意 | 省略時・ドキュメント未存在時は `[]` 扱い。最大50件。`id` は1文字以上、`text` は1〜100文字 | タイムテーブル印刷用 Todo リスト |
| safeBalanceChecker | string | 任意 | 省略時・ドキュメント未存在時は `''` 扱い | 宿泊税テーブルの締めスタッフ名 |
| CleaningBoardUserNotes | string | 任意 | 空文字可 | 旧/将来用。現行コードでは読み書きしていない |
| source.collection | string | 任意 | - | 移行元コレクション名 |
| source.path | string | 任意 | - | 移行元ドキュメントパス |
| source.field | string | 任意 | `"safeBalanceChecker"` 固定 | 移行元フィールド名 |
| migrated_at | string | 任意 | ISO8601 JST 形式 | マイグレーション実行日時 |
| updated_at | string | 任意 | ISO8601 JST 形式 | 最終更新日時 |

### バリデーションルール

- `dailyInfo/{date}` が存在しない場合、取得系は空値を返す。
- `safeBalanceChecker` と `todos` の更新は `set(..., { merge: true })` でドキュメントを作成/更新する。
- `todos` が配列でない場合は `[]` として扱う。
- `todos` が配列だが要素形式が不正な場合は `FIRESTORE_DATA_CORRUPTION`。
- `updated_at` は `new Date().toISOString()` で保存するため UTC ISO 文字列。

---
