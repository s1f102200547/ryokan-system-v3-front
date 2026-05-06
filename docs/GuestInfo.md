# guestInfo / a_tax_table　v2 -> v3 移行計画

## 参照実装

- 必ずAGENTS.mdの実装方針に準拠する
- `reference/v2/GuestInfo` を参照する。
- 現状のdaily-dashboardに追加していく感じ - 日付切り替えは実装済みなのであとはreference/v2/guestInfoを参照してmain部分を実装する。
- reference/v2/GuestInfo/*のUI・UXだけ参考にしてコードのロジックは設計し直す必要がある。

## ルーティング

- 既存の`/daily-dashboard`
- `/a_tax_table`

## guestInfo 表示

- 選択中の日付が C/I の予約を表示する。
- 表示内容は以下。
  - room
  - guest_name

- ゲストアイコンをクリックするとモーダルを開く。
- モーダルは v2 の `ReservationDialog` と同じ構成（C/I前・C/I後の2タブ）にする。
  - C/I前タブ: 予約詳細編集 + mail_memo
  - C/I後タブ: A_tax + マーケティング情報

## 印刷ボタン配置

`/daily-dashboard` 既存の
- timetable 印刷ボタン
- CleaningBoard 印刷ボタン

上記 2 つは日付ナビゲーション行の右端に `IconButton`（`PrintIcon` のみ）として並べる。
- ツールチップでラベル表示
- `size="small"` 相当の控えめなサイズ

## キャンセル予約

- キャンセル済み予約は表示する。(v2と異なる)
- 選択中の日付に C/I だったキャンセル済み予約を、通常予約の下に常時表示する（折り畳みなし）。
- 小さく目立たない表示にする。
- 通常予約と同様、クリックするとゲスト情報モーダルを開く。
- キャンセル予約は復活できるようにする。
- 復活処理は `cancel` フィールドを `0` に戻すだけでよい。
- 復活時は理由を入力させる。
- 復活理由はメールログへ反映する。

メールログ内容（復活時）:

- 日付: 対象日
- 名前: guest_name
- ソース: `システム`
- title: `キャンセル復活`
- 本文: 復活理由

- キャンセル復活時は管理者 Slack へ通知する。
- Slack 通知は error 通知で使っているものと同じ仕組みを使う。

Slack メッセージ形式（復活時）:
```
[予約復活] {reservation_number} - 理由: {復活理由}
```

## キャンセル処理

- キャンセル時は confirmation を表示する。
- confirmation 後、手動キャンセル理由を必須入力させる。
- キャンセル理由はメールログへ反映する。

メールログ内容（キャンセル時）:

- 日付: 対象日
- 名前: guest_name
- ソース: `システム`
- title: `キャンセル`
- 本文: キャンセル理由

- キャンセルされたら管理者 Slack へ通知する。
- Slack 通知は error 通知で使っているものと同じ仕組みを使う。

Slack メッセージ形式（キャンセル時）:
```
[キャンセル] {reservation_number} - 理由: {キャンセル理由}
```

## 新規追加

- `reference/v2/GuestInfo` と同様の UI で予約を手動追加できるようにする。
- チェックイン日は選択中の日付を使う。
- 入力項目は以下。

必須項目:

- C/O 日
- room
- adult_number
- child_number
- guest_name
- 予約サイト（A_tax の有無を決めるための項目であることを明示する）
  - 選択肢: `Chillnn` / `Booking.com` / `Expedia` / `Other`
  - `Chillnn` のみ A_tax 不要
- 追加理由

書き込み仕様:

- 書き込み先: `reservations` コレクション
- `reservation_number`: UUID v7 で採番する（Firebase 依存を避けるため）
- `source`: `"manual"`（Gmail取り込みと区別するため）
- `cancel`: `0`
- `mail_memo`: `[]`
- その他未入力フィールドはスキーマのデフォルト値に従う

- 新規追加されたら管理者 Slack へ通知する。
- Slack 通知は error 通知で使っているものと同じ仕組みを使う。

Slack メッセージ形式（新規追加時）:
```
[手動追加] {reservation_number} - 理由: {追加理由}
```

## a_tax_table

- `/a_tax_table` を追加する。
- UI・UX は `reference/v2/ATaxTable` と同じ仕様でよい。

v2 からの差分（必ず対応すること）:

- `safeBalanceChecker` の取得元: `daily/{YYYY-MM-DD}.safeBalanceChecker`（v2 とコレクション構造が異なる）
- `booking_site` の比較は v3 Schema の enum に合わせる。
  - v2 コードは `booking_site?.toLowerCase() === 'chillnn'` と小文字比較しているが、v3 のSchema では `"Chillnn"`（先頭大文字）のため、そのまま移植するとA_tax判定が常にfalseになるバグが発生する。
  - v3 では `booking_site === 'Chillnn'` で比較する。
