- maillogの編集をすると「保存に失敗しました。管理者に通知済みです」と表示される
- C/I前・C/I後のどれかの要素を編集(保存成功だと表示される)->モーダルを閉じる->モーダルを開ける->編集した文章が消えてしまう(反映されてない)->ブラウザ再読み込み->編集が反映される
- openAirBath/breakfastを"未定"選択しても"未定"と表示されない
- 
- room を "未アサイン" と選択すると「保存に失敗しました。管理者に通知済みです」と表示される
- 大人人数を0にすると「保存に失敗しました。管理者に通知済みです」と表示される。
- 新規追加して再レンダリングすると以下のエラーが出る（再度実行したら成功した）
{"level":"ERROR","message":"Schema validation failed for doc 307f09d5-cd1f-4e45-8d51-5ecca4b996a2 [check_out_date: Invalid string: must match pattern /^\\d{4}\\/\\d{2}\\/\\d{2}$/]","timestamp":"2026-05-07T10:18:38.508Z","infraErrorCode":"FIRESTORE_DATA_CORRUPTION"}
 GET /api/guest-info?date=2025-04-29 500 in 304ms (next.js: 3ms, application-code: 301ms)
- infra層でどれかの予約がzodや型定義で引っかかった場合、全体をエラー扱いにするのではなくその予約だけ取り除いて他の問題ない予約は表示したい。
- 新規予約追加について、スタッフ名も記入させてキャンセルと同様、日付・システム・スタッフ名・summary=手動で新規追加・text={追加理由} としてmaillogに追加したい
- 新規追加した後に印刷ボタンを押すと以下のエラーが出る。
{"level":"ERROR","message":"Schema validation failed for doc 307f09d5-cd1f-4e45-8d51-5ecca4b996a2 [check_out_date: Invalid string: must match pattern /^\\d{4}\\/\\d{2}\\/\\d{2}$/]","timestamp":"2026-05-07T10:26:00.500Z","infraErrorCode":"FIRESTORE_DATA_CORRUPTION"}
 GET /api/cleaning-board?date=2025-04-28 500 in 483ms 