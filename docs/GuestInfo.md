# guestInfo / a_tax_table　v2 -> v3 移行計画

## 参照実装

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

- `reference/v2/GuestInfo` と同様、ゲストアイコンをクリックするとモーダルを開く。

## 印刷ボタン配置

`/daily-dashboard`既存の
- timetable 印刷ボタン
- CleaningBoard 印刷ボタン

上記 2 つは右上に小さく表示する。

## キャンセル予約

- キャンセル済み予約は表示する。(v2と異なる)
- 画面下側に小さく、目立たない表示で常時表示する。
- 通常予約と同様、クリックするとゲスト情報モーダルを開く。
- キャンセル予約は復活できるようにする。
- 復活処理は元の予約状態へ戻すだけでよい。
- 復活時は理由を入力させる。
- キャンセル理由はメールログへ反映する。

メールログ内容:

- 日付: 対象日
- 名前: guest_name
- ソース: `システム`
- title: `キャンセル`
- 本文: キャンセル理由

- キャンセル復活時は管理者 Slack へ通知する。
- Slack 通知は error 通知で使っているものと同じ仕組みを使う。

## キャンセル処理

- キャンセル時は confirmation を表示する。
- confirmation 後、手動キャンセル理由を必須入力させる。
- キャンセル理由はメールログへ反映する。

メールログ内容:

- 日付: 対象日
- 名前: guest_name
- ソース: `システム`
- title: `キャンセル`
- 本文: キャンセル理由

- キャンセルされたら管理者 Slack へ通知する。
- Slack 通知は error 通知で使っているものと同じ仕組みを使う。

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
- 予約サイト
  - A_tax の有無を決めるための項目であることを明示する
- 追加理由

- 新規追加されたら管理者 Slack へ通知する。
- Slack 通知は error 通知で使っているものと同じ仕組みを使う。

## a_tax_table

- `/a_tax_table` を追加する。
- `reference/v2/GuestInfo` と同じ仕様でよい。