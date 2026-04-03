
## `daily` コレクション

日次データ。ドキュメントIDは対象日（`YYYY-MM-DD`）。

**クエリキー例:**
```ts
doc("daily/2026-03-31")
```

### フィールド定義

| フィールド | 型 | 必須/任意 | 制約 | 説明 |
|---|---|---|---|---|
| date | string | 必須 | `YYYY-MM-DD` 形式 | ドキュメントIDと同じ日付 |
| CleaningBoardUserNotes | string | 任意 | 空文字可 | 清掃ボードのユーザー入力備考テキスト |
| safeBalanceChecker | string | 任意 | - | `guestInfoRoom/{year}/{month}/{day}` の `safeBalanceChecker` をそのまま保持 |
| source.collection | string | 任意 | - | 移行元コレクション名 |
| source.path | string | 任意 | - | 移行元ドキュメントパス |
| source.field | string | 任意 | `"safeBalanceChecker"` 固定 | 移行元フィールド名 |
| migrated_at | string | 任意 | ISO8601 JST 形式 | マイグレーション実行日時 |
| updated_at | string | 任意 | ISO8601 JST 形式 | 最終更新日時 |

### バリデーションルール

- ドキュメントが存在しない場合はフロント側で新規作成する

---