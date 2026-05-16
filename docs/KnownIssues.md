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

## DBが問題
- 現在は未使用フィールドや不正データが存在し、`zod`のバリデーションエラーを引き起こすことがある
- 将来は定期的にDBをチェックする専用バックエンドをclaudeRun上に実装する

## DBのトランザクションのロックを実装してない
- 現在はread処理しか実装してない
- 7部屋・少人数運用なので同時書き込みが起きる確率が極めて低い
- 将来、write処理を実装する場合は楽観的ロック（runTransaction）で囲めば十分

## Slack通知のエラーハンドリング問題
- slack通知に失敗した時にcloud run のlogに表示されるだけなので気付けない

## npm run dev した時にerrorになる。
- Next.js 16 の Turbopack と Firebase JS SDK v12 の間の互換性問題が生じる時がある
- 以下のコマンドで直った。
```
rm -rf .next
rm -rf node_modules/.cache
npm run dev
```

## targetData drivenで時系列データを処理すべきじゃなかった
- 現在はtargetDateの1つの日付を引数にしてdb取得してDomainで計算してuiで表示している
- 様々な制約や処理をtargetDate1つを起点にやろうとするとUseCase-Domainがとても複雑になる
- 時系列データを扱う専用のアーキテクチャを採用すべきだった。

## アクセス可能な日付範囲に制限がない
認証済みであれば過去・未来どの日付でも照会できる。必要に応じて ±N日の制限を検討すべき。

## 日付バリデーションが正規表現のみ
route.ts の QuerySchema は /^\d{4}-\d{2}-\d{2}$/ のみ。2026-13-45 のような存在しない日付が通過する。
-> 存在する日付かつ取得しようとしている日付と一致しているか確かめる方が良いかも

## zapのfullモード試さずに本番環境デプロイしてる
- どの環境でやるか検討すべき

## ciが通らなくてもdeployが実行されてしまう

## Ataxのエラー処理が不十分
 src/components/aTaxTable/ReservationTable.tsx の const [error, setError] = useState<string | null>(null) — error は {error && <Alert>} で表示されているが、setError はコンポーネント内で一度も呼ばれていない（void setError で警告を無効化するのみ）。つまり ATaxCheckboxCell / StaffNameCell / SafeBalanceCheckerCell のセーブが失敗しても ユーザーには何も通知されない。
 上記3セルは useUpdateATax / useUpdateSafeBalanceChecker の error を持つが UI に渡していない。

 # deploy.mdの内容が未完成
 - deployment環境をまだ作ってない

 # ブルートフォース体制なし
 - ログイン失敗時のログや通知も一緒にやる

 # レート制限・DoS対策層


 -----------

# リファクタリングしきれてない
 以下について現状を調査
## 日付バリデーションが正規表現のみ
route.ts の QuerySchema は /^\d{4}-\d{2}-\d{2}$/ のみ。2026-13-45 のような存在しない日付が通過する。
-> 存在する日付かつ取得しようとしている日付と一致しているか確かめる方が良いかも

ー＞できてたらKnownIsuues.mdから削除

## Ataxのエラー処理が不十分
 src/components/aTaxTable/ReservationTable.tsx の const [error, setError] = useState<string | null>(null) — error は {error && <Alert>} で表示されているが、setError はコンポーネント内で一度も呼ばれていない（void setError で警告を無効化するのみ）。つまり ATaxCheckboxCell / StaffNameCell / SafeBalanceCheckerCell のセーブが失敗しても ユーザーには何も通知されない。
 上記3セルは useUpdateATax / useUpdateSafeBalanceChecker の error を持つが UI に渡していない。

 1. 全てのmdをupdateする
 2. エラー処理確認
 3. CI/CD確認
 4. 認証・認可問題ないか確認
 5. コードのセキュリティ上問題ある点がないか確認
 6. 脆弱性診断ツール確認
 7. Testコードの正当性と網羅性を確認
 8. 

現状のコードとmd整合性と改善点の確認(実装はまだで計画のみ)
 0. 認証認可を確認する->md update
 1. Architectureを確認する->md update(CleaningBoard.mdなども含む)
 2. Deployを確認する->md update
 3. ErrorHandlingを確認する->md update
 4. Securityを確認する->md update
 4. 脆弱性診断ツール確認する->md update
 5. Refactoringを確認する->md update(review.mdを削除して統合する)
 6. Test(正当性と網羅性)を確認する->md update