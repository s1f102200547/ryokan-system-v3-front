# 依存パッケージの管理

依存パッケージは T6 の入口（E6）である。このアプリのコードより依存のコードのほうがはるかに多いので、**数を増やさない・入れるときに確かめる・入れ方を固める・すぐ更新できる**の4つで管理する。

## 現状（2026-11-01 時点）

| 項目 | 状態 |
|---|---|
| パッケージの数（lock ファイル上） | 808（本番用 367、開発用 441）。直接の依存は本番用 15、開発用 14 |
| 署名と provenance | `npm audit signatures` で、714 パッケージのレジストリ署名と、149 パッケージの attestation（provenance）を確認できた |
| install script を持つもの | `@firebase/util`（ブラウザ用 `firebase` から。Firebase Hosting 用の既定設定を書き出す処理で、このアプリでは不要）、`protobufjs`（`firebase-admin` から。バージョン表記の警告を出すだけ）、`esbuild`・`unrs-resolver`（開発用。バイナリの取得や確認）、`fsevents`（開発用、macOS のみ） |
| 既知の脆弱性の例外 | `@grpc/grpc-js` の high（`scripts/ci/auditAllowlist.ts`）。`firebase-admin` 経由の low 8件（`docs/KnownIssues.md`） |
| バージョンのずれ | `@types/node` が `^20`（Node 24 への更新時に合わせる）。`eslint-config-next` が 16.2.1 で、`next`（16.4.3）とずれている |
| 自動更新 | なし（Dependabot が未設定） |

## 追加するときの確認

新しい依存を入れる PR には、次を確認した結果を書く。

| 確認すること | 基準 |
|---|---|
| 本当に必要か | 標準 API（Web API、Node.js）や、すでに入っている依存で代わりにできないか。数十行で書ける小さな処理なら自分で書く。ただし暗号・認証・入力のパースなど、間違えると危険なものは自作しない |
| メンテナンスの状態 | 最近もリリースがあるか。メンテナが1人だけではないか。利用者が十分に多いか |
| 発行元の確かさ | provenance（attestation）付きで公開されているか |
| install script | あるなら、何をするかを読む。不要なら `ignore-scripts` のまま使えるか確かめる |
| 連れてくる依存の数 | lock ファイルの差分で、増えるパッケージの数を確認する |
| 置き場所 | テストやビルドにしか使わないものは `devDependencies` に入れる（本番のイメージに入れない） |
| ライセンス | 商用利用できるもの（MIT、Apache-2.0、BSD など） |

## 更新の手順

| 種類 | 手順 |
|---|---|
| 実際に悪用されている脆弱性（CISA KEV に載っている、または悪用が報告されている）で、このアプリで実行されうるもの | **数日以内**に更新してデプロイする |
| high / critical の脆弱性で、このアプリで実行されうるもの | 1〜2週間以内に更新する |
| このアプリで実行されない脆弱性 | `scripts/ci/auditAllowlist.ts` に理由と期限（最長3か月）を書いて許可する |
| 通常の更新（minor / patch） | Dependabot で週1回、まとめて PR にする（`groups`）。公開から7日たったものだけを対象にする（`cooldown`。セキュリティ更新には適用されないので、修正は遅れない） |
| major の更新 | 1パッケージずつ別の PR にする。Context7 で移行ガイドを確認する（AGENTS.md） |
| React / Next.js | 公式のセキュリティ情報（Next.js の GitHub advisories、React のブログ）を見る。RSC と proxy は、繰り返し脆弱性が出ている場所 |

更新の PR では、CI が通ることに加えて **lock ファイルの差分**を見る。知らないパッケージが増えていないか、install script を持つものが増えていないか、`resolved` が `registry.npmjs.org` 以外を指していないかを確認する。

## インストールの防御

| 対策 | 内容 |
|---|---|
| lock ファイルどおりに入れる | CI と Docker では `npm ci` だけを使う（今もそうなっている）。`npm install` は依存を変えるときだけ使う |
| `.npmrc` をリポジトリに置く | `ignore-scripts=true` と `min-release-age=7`。npm 11.10 以降が必要（Node 24 への更新とあわせて npm も更新する） |
| `ignore-scripts` の確認 | 導入前に `npm ci --ignore-scripts` のあと、lint、型チェック、unit、emulator、E2E、build がすべて通ることを確かめる。「現状」の install script は、このアプリでは不要か代わりの仕組みがある見込みだが、実際に確認する |
| Docker build | 今の Dockerfile は、依存を入れる段階で `package.json` と `package-lock.json` しかコピーしていない。**`.npmrc` もコピーしないと、イメージのビルドでは設定が効かない** |
| 署名の検証 | CI に `npm audit signatures` を追加する。署名が不正なパッケージがあれば失敗させる |
| 開発 PC | リポジトリの `.npmrc` は、このリポジトリの中だけで効く。ほかのプロジェクトも含めて守るなら、`~/.npmrc` にも同じ設定を書く。バージョンを指定しない `npx <パッケージ>` は使わない |

## 実行環境とベースイメージ

- Node.js は 24 LTS にする（Dockerfile、CI、`@types/node`）。
- Docker のベースイメージ（`node:24-alpine`）は digest で固定し、Dependabot（`docker`）で更新する。
- 本番のイメージには `standalone` の出力だけを入れる（今もそうなっている。開発用の依存はイメージに入らない）。

## GitHub Actions

- アクションも依存の一つとして扱う。コミット SHA に固定し（T6-6）、Dependabot（`github-actions`）で更新する。
- できるだけ GitHub や Google などの公式のアクションを使う。サードパーティのアクション（今は `zaproxy/action-baseline`）は、更新の PR で差分を見てから取り込む。

## SBOM（部品表）

- デプロイのたびに、`npm sbom --sbom-format cyclonedx` で SBOM を作り、GitHub Actions の artifact として残す。
- 「乗っ取られたバージョンが本番に入っていたか」に、すぐ答えられるようにするため（`IncidentResponse.md`）。

## 減らす候補

| 依存 | 方針 |
|---|---|
| `firebase`（ブラウザ用） | ログインのサーバー経由化（P3）で削除する。`@grpc/grpc-js` の例外と、`@firebase/util` の install script もなくなる |
| `eslint-config-next` | `next` とバージョンを合わせる |
| そのほか | 四半期の点検（`Checklist.md`）のときに、使っていない依存がないか確認する |
