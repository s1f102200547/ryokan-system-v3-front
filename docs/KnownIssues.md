# Known Issues

## npm audit の moderate（22件）と Dependabot の警告を対応不要としている

**状態**: 未修正（対応不要。2026-11-02 確認）

npm audit の moderate は、実体は次の2つの advisory だけで、残りはそれを含む上位のパッケージが数えられたもの。CI（`npm run audit:ci`）は high 以上だけを見るので、どちらも CI を止めない。Dependabot のセキュリティ更新も、今の依存の範囲に直したバージョンがないため失敗する（警告は「Vulnerable code is not actually used」で、下の理由を付けて Dismiss する）。

| advisory | 依存の経路 | 対応しない理由 | 解消する方法 |
|---|---|---|---|
| `uuid` GHSA-w5hq-g745-h8pq（v3・v5・v6 に `buf` を渡したときの範囲外書き込み） | `firebase-admin` → `@google-cloud/firestore`・`@google-cloud/storage` → `google-gax`・`teeny-request`・`retry-request` → `uuid@9` | これらは ID の生成（v4）に使っていて、`buf` を渡す v3・v5・v6 の呼び出しはない見込み。アプリが直接使う `uuid` は修正済みの 14 | `firebase-admin` を 14 に上げる（大きな版の変更なので後回し。`docs/Security/SecurityMeasures/ImplementationPlan.md` の「後回しにした作業」） |
| `minimatch` GHSA-g3hv-75wg-m249（パターンによる DoS） | `eslint`・`eslint-config-next` → `minimatch@3` | 開発用のツール（lint）だけが使い、本番のイメージには入らない。攻撃者が作ったパターンを渡されることもない | `eslint` 側の依存の更新を待つ |

- `npm audit fix --force` は使わない。`firebase-admin` や `eslint-config-next` を大きく古い版に下げる案になり、API が壊れる。
- high の `@grpc/grpc-js` は、下の「npm audit の high 4件を例外として許可している」を参照。
- 以前ここにあった `@tootallnate/once` の low（8件）は、依存の更新で出なくなった。

 ## DBスキーマのDate Format が統一されてない

 本来、日付フォーマットは `YYYY-MM-DD` に統一すべきだが 既存のDBスキーマとの互換性維持のため、`YYYY/MM/DD`と混在する

## boolenと1/0の混在
- 現在はlateoutやcancelなどは1/0になっている。
- 本来はboolenに統一したい。
- 従来のdb構造を引き継ぐ必要があるのでとりあえず放置している

## zapで見つかった問題
@Security/Security.md

## DBデータが汚い
- 現在は未使用フィールドや不正データが存在し、`zod`のバリデーションエラーを引き起こすことがある
- 将来は定期的にDBをチェックする専用バックエンドをclaudeRun上に実装する

## 同じ予約を同時に編集すると、後から保存した側が上書きする
- 予約の更新は読み取り・検査・書き込みを `runTransaction` で囲んでいる（泊数と配列の長さの整合のため。`docs/BugHunting.md` #3, #6）。ただし、画面が古い値のまま保存することは防いでいない
- 同じ予約を2つのタブや2人で開いて編集すると、配列ごとの上書きで先の変更が消える（`docs/BugHunting.md` #13）
- 7部屋・少人数運用で同時に開くことはまれなので、現状維持とした（2026-10-31 決定）。起きたら、読んだときの Firestore の更新時刻を保存時に送り、その後に書かれていたら 409 にする楽観的ロックを入れる

## 部屋未割り当ての予約はタイムテーブルと清掃ボードに出ない
- 部屋（`room`）が null の予約は、ダッシュボードには「—」のカードで出るが、タイムテーブル（到着・夕食・朝食）と清掃ボードは部屋ごとに作るので出ない（`docs/BugHunting.md` #26）
- 当日までに部屋を割り当てる運用とし、現状維持とした（2026-10-31 決定）。割り当てずに当日を迎えると、厨房の人数などから漏れる

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

