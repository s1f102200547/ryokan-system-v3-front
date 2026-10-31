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

## boolenと1/0の混在
- 現在はlateoutやcancelなどは1/0になっている。
- 本来はboolenに統一したい。
- 従来のdb構造を引き継ぐ必要があるのでとりあえず放置している

## zapで見つかった問題
@Security.md

## DBデータが汚い
- 現在は未使用フィールドや不正データが存在し、`zod`のバリデーションエラーを引き起こすことがある
- 将来は定期的にDBをチェックする専用バックエンドをclaudeRun上に実装する

## DBのトランザクションのロックを実装してない
- 現在はread処理しか実装してない
- 7部屋・少人数運用なので同時書き込みが起きる確率が極めて低い
- 将来、write処理を実装する場合は楽観的ロック（runTransaction）で囲めば十分

## Slack通知のエラーハンドリング問題
- slack通知に失敗した時にcloud run のlogに表示されるだけなので気付けない

## targetData drivenで時系列データを処理すべきじゃなかった
- 現在はtargetDateの1つの日付を引数にしてdb取得してDomainで計算してuiで表示している
- 様々な制約や処理をtargetDate1つを起点にやろうとするとUseCase-Domainがとても複雑になる
- 時系列データを扱う専用のアーキテクチャを採用すべきだった。

## zapのfullモード試さずに本番環境デプロイしてる
- どの環境でやるか検討すべき

## ciが通らなくてもdeployが実行されてしまう

## staging環境を想定したci/cdを作っていない

## ブルートフォース体制なし
 - ログイン失敗時のログや通知も一緒にやる

## レート制限・DoS対策層

## npm audit の high 4件を例外として許可している
- ブラウザ用 `firebase` の `@firebase/firestore` が `@grpc/grpc-js` を `~1.9.0` に固定しており、firebase 最新版（13.1.0）でも high 4件（実体は grpc-js の advisory GHSA-m9gg-hp2v-232j の1件）が残る
- このアプリでは実行されないコードのため、CI は例外リスト（`scripts/ci/auditAllowlist.ts`、期限 2027-01-31）で許可している。詳細は `docs/CICD.md`
- 根本対応の候補: firebase の上流修正を待つ / ログインをサーバー側の Identity Toolkit REST に移し、`firebase` パッケージ自体をなくす

## 新規予約ダイアログの Select にラベルが関連付いていない
- `AddReservationDialog.tsx` の「部屋」などの `Select` に `labelId` がなく、アクセシブルネームがない
- スクリーンリーダーで項目名が読まれない。テストでも `getByLabel` で選べない

