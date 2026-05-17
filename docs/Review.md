# Review Guide

## 基本方針

実装後、push 前にコードレビュー視点で確認する。レビューは感想ではなく、バグ・セキュリティリスク・運用リスク・テスト不足を優先して指摘する。

## 必須観点

### 仕様・業務ロジック

- 旅館業務上の重要条件（CI/CO、連泊、キャンセル、復活、宿泊税、部屋番号）が壊れていないか。
- `[]`, `null`, `undefined`, `0`, `""`, 範囲外の月日、日付逆転、キャンセル済み予約などの境界値で破綻しないか。
- 日付比較は `YYYY-MM-DD` 前提と JST の扱いが混ざっていないか。
- 7部屋前提の定数や表示順が `src/constants/` と一致しているか。

### アーキテクチャ

- `docs/Architecture.md` の層ルールに違反していないか。
- Domain 層が React/Next.js/Firebase に依存していないか。
- Components が Application/Infra を直接呼んでいないか。
- Hooks が UI 向け状態管理と API 呼び出しに留まり、Domain/Infra を直接呼んでいないか。
- 状態変更は Command、読み取りは UseCase の命名・責務に沿っているか。

### エラーハンドリング

- request body、query、params は Route Handler の入口で Zod 検証しているか。
- Infra 層で Firebase/gRPC/ZodError を `InfraError` に変換しているか。
- `InfraErrorCode` を追加した場合、`infraErrorToHttpStatus.ts` と AGENTS.md の表を更新しているか。
- Application 層で不要に catch して握りつぶしていないか。
- Route Handler は `handleRouteError` などでログ・HTTP status・Slack 通知の方針に沿っているか。
- UI は Hooks から受け取った日本語メッセージを表示し、内部実装や監視情報を公開していないか。

### セキュリティ

- `docs/Security.md` の認証境界、CSP、Cookie、Cloud Run 公開設定と矛盾しないか。
- API は session 検証を必ず行っているか。ただし `/api/auth/login` は例外。
- Cookie は `httpOnly`, `sameSite`, production `secure` を維持しているか。
- Firebase の秘密情報や実顧客情報がコード・テスト・ログ・ドキュメントに混入していないか。
- `NEXT_PUBLIC_*` と server-only secret の扱いを混同していないか。

### UI/UX

- loading、empty、error、保存中、保存済みの状態が見えるか。
- 楽観的 UI の失敗時に戻し処理または明確なエラー表示があるか。
- 印刷コンテンツは業務利用に耐える密度・改ページ・表示欠けになっていないか。
- MUI コンポーネントは既存の画面トーンと揃っているか。

### テスト

- Domain の分岐・境界値は unit test で確認しているか。
- Route Handler は認証、validation、正常系、主要な `InfraError`、想定外エラーを integration test で確認しているか。
- E2E はログイン、主要画面、重要な状態変更、印刷表示などユーザー価値の高い流れに絞れているか。
- E2E は Firebase 実認証に依存せず、Playwright の mock 方針に沿っているか。
- テストデータは業務上の代表ケースと境界ケースを含むか。

### パフォーマンス・運用

- 不要な再 fetch、過剰な re-render、重い計算の render 内実行がないか。
- Firestore 読み取り回数が画面表示のたびに過剰になっていないか。
- Cloud Run standalone build、`PORT=8080`、環境変数、Dockerfile と矛盾しないか。
- 障害時に Cloud Logging と Slack 通知で原因を追えるログ粒度になっているか。

### ドキュメント

- `AGENTS.md`, `docs/*.md`, `docs/Schema/*.md` と実装が一致しているか。
- CI/CD の変更時は `.github/workflows/*.yml` と `docs/CICD.md` を同時に更新しているか。
- セキュリティ・テスト・エラー処理方針の変更は該当 doc に反映しているか。

## 実行コマンド

最低限:

```bash
npm run lint
npx tsc --noEmit
npm run test
```

UI、認証、ルーティング、印刷、主要画面に触れた場合:

```bash
npm run e2e
```

Cloud Run / Docker / Next.js config に触れた場合:

```bash
npm run build
```
