# Known Issues

## firebase-admin の間接依存に low severity の脆弱性（8件）

**状態**: 未修正（対応不要）

**概要**

`firebase-admin` → `@google-cloud/*` → `teeny-request` → `http-proxy-agent` → `@tootallnate/once` の依存チェーンに Incorrect Control Flow Scoping の脆弱性がある。

**対応しない理由**

- severity が low で、旅館アプリではこのコードパスを直接使わない
- `npm audit fix --force` を実行すると `firebase-admin` が `10.3.0` にダウングレードされ、Firestore / Auth の API が破壊的に変わる
- 修正は `firebase-admin` 側の依存更新待ち


 ## DBスキーマのDate Format が統一されてない

 本来、日付フォーマットは `YYYY-MM-DD` に統一すべきだが 既存のDBスキーマとの互換性維持のため、`YYYY/MM/DD`と混在する

## CleaningBoardの警告はcheck_in_dateだけ
- 現在の仕様は警告は check_in_date だけ表示
- 本来は check_in_date + guest_name を警告表示したほうがわかりやすい
- infraで guest_name 取得してないところに警告のためだけに取得するのは面倒なのでとりあえずは現在の仕様のままにする

## boolenと1/0の混在
- 現在はlateoutやcancelなどは1/0になっている。
- 本来はboolenに統一したい。
- 従来のdb構造を引き継ぐ必要があるのでとりあえず放置している

## zapで見つかった問題
@Security.md

## DBが問題
- 現在は未使用フィールドや不正データが存在し、`zod`のバリデーションエラーを引き起こすことがある
- 将来は定期的にDBをチェックする専用バックエンドをclaudeRun上に実装する

## DBのトランザクションのロックを実装してない
- 現在はread処理しか実装してない
- 7部屋・少人数運用なので同時書き込みが起きる確率が極めて低い
- 将来、write処理を実装する場合は楽観的ロック（runTransaction）で囲めば十分

## Next.jsとリアルタイムDB更新
- Next.jsでスムーズなリアルタイム更新UXを実装できるか疑わしい
- リアルタイムDB更新を前提としたDBのwriteのリトライなどのエラーハンドリングは未実装

## Slack通知のエラーハンドリング問題
- slack通知に失敗した時にcloud run のlogに表示されるだけなので気付けない

## ui層の日付指定未実装
- 現在はcleaningBoardのui層で日付指定している
- 将来は日付指定機能の下にcleaningBoardを含めた様々な機能を実装する(複数機能で同じ日付を共有する)