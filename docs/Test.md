# Test Guide

## 基本方針

テストは層ごとに役割を分ける。

| 種別 | 対象 | 目的 |
|---|---|---|
| Unit test | Domain 層 | ビジネスルール、境界値、分岐を高速に検証 |
| Integration test | Route Handler | HTTP 入口から出口までの認証・validation・status・JSON を検証 |
| E2E test | 重要フロー | ユーザーが実際に使う画面遷移・表示・操作を検証 |

実装順は AGENTS.md の方針どおり、重要フローでは E2E → Domain unit → Domain → Infra → Application → Hooks → Route Handler integration → UI を基本にする。

## Commands

```bash
npm run test
npm run e2e
```

関連チェック:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

## Unit Test

Domain 層は最も厚くテストする。

対象例:

- `src/domain/room/roomState.ts`
- `src/domain/reservation/bookingSitePolicy.ts`
- `src/domain/reservation/nightArrays.ts`
- `src/domain/auth/loginPolicy.ts`

確認する観点:

- 日付境界: CI 当日、CO 当日、前日、翌日、連泊最終夜、未来 CI。
- 予約状態: 通常、キャンセル済み、復活候補、late checkout。
- 数値境界: 人数 0、泊数 0、1泊、複数泊。
- 配列境界: 空配列、増減、undefined 補完。
- Domain は Firebase/React/Next.js に依存しない。

## Integration Test

Route Handler の `*.test.ts` は、外部依存を mock して HTTP としての振る舞いを確認する。

各 Route Handler で最低限確認する:

- 未認証なら `401`。
- body/query/params が不正なら `400`。
- 正常系の status と JSON shape。
- `FIRESTORE_UNAVAILABLE` など主要な `InfraError` の status。
- 想定外エラーが `500` になること。

状態変更 API では追加で確認する:

- 空 body や空 patch を拒否する。
- 必須理由・staff name など監査に必要な項目を検証する。
- 日付逆転や範囲外値を拒否する。

## E2E Test

E2E は重要フローに限定し、DB や実 Firebase 認証に依存させない。

現在の主な対象:

- `e2e/login.spec.ts`: ログイン画面、成功/失敗、redirect。
- `e2e/routing.spec.ts`: 未定義 path と認証状態ごとの redirect。
- `e2e/daily-dashboard.spec.ts`: 日付移動、印刷用タイムテーブル、清掃ボード。
- `e2e/guestInfo.spec.ts`: 予約一覧、モーダル、auto-save、追加/キャンセル UI。
- `e2e/atax.spec.ts`: 宿泊税一覧、集計、チェック、CSV 表示条件。

E2E で見るべきもの:

- 画面が表示できる。
- 業務上重要な情報が表示される。
- 代表的な操作ができる。
- loading/error/empty のうちユーザー影響が大きい状態。
- 印刷領域に必要情報が欠けていない。

E2E でやりすぎないもの:

- Domain の全分岐。
- Route Handler の全 status。
- Firebase SDK 自体の挙動。
- 細かい MUI の内部表現。

## E2E における認証情報の扱い

実際のメールアドレス・パスワードは使わない。

理由:

- 実顧客情報・運用認証情報の漏えいに直結する。
- GitHub Secrets に置くと管理対象が増える。
- `.env` に置くと誤コミットのリスクがある。

方針:

- Firebase 依存部分は Playwright の route mock で置き換える。
- CI では Firebase SDK の API key 存在チェックを通すため、`NEXT_PUBLIC_FIREBASE_*` にダミー値を設定する。
- 実リクエストは mock で遮断し、外部サービスに依存しない。

ローカルの `.env.test.local` は必要な場合だけ使う。実運用の認証情報は入れない。

## Test Data

テストデータは実データを使わず、以下を含む人工データにする。

- 部屋番号: 既存の `ROOM_NUMBERS` に存在する値。
- 日付: 固定日付を使い、JST の今日に依存しない。
- 予約: CI、CO、連泊、キャンセル、late checkout、宿泊税対象/免税。
- 名前・メモ: 実在顧客を連想しない値。

## Coverage Policy

優先順位:

1. Domain の業務ルール分岐。
2. Route Handler の認証・validation・error mapping。
3. E2E の重要フロー。
4. Hooks/UI のうち、回帰リスクが高い状態遷移。

現時点では coverage 数値目標より、重要な業務条件がテストで固定されていることを優先する。

## 追加・変更時の判断

- Domain 関数を追加/変更したら unit test を追加する。
- API を追加/変更したら Route Handler integration test を追加する。
- 画面の主要導線や保存フローを変更したら E2E を追加または更新する。
- ドキュメントだけの変更なら、テスト実行は必須ではない。ただし内容が CI/CD や build 手順に触れる場合は対象 workflow と実装を確認する。
