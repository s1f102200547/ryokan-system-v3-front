# Context7 Guide

## 基本方針

このプロジェクトは React 19、Next.js 16、MUI v7、Firebase v12、Zod v4 など新しいバージョンを使う。ライブラリやフレームワークに関わる実装・設定・API 仕様の確認では、古い知識で補完せず Context7 の公式ドキュメントを先に確認する。

## Context7 を使う場面

- コンポーネント、関数、Route Handler、Server Action などのコード生成。
- セットアップ、インストール、configuration。
- API 仕様、メソッドシグネチャ、props、戻り値。
- ベストプラクティスや推奨される書き方。
- バージョン固有の機能や挙動。

自然言語の説明、プロジェクト固有の業務ロジック、命名・ファイル構造の相談では必須ではない。

## 手順

1. 既知 ID がある場合は `resolve-library-id` を省略する。
2. `query-docs` または `get-library-docs` で具体的な query を投げる。
3. 取得した最新公式ドキュメントに基づいて実装・回答する。
4. 1質問あたり最大3回までに抑える。

## 既知 ID

| ライブラリ | Context7 ID | バージョン |
|---|---|---|
| Next.js | `/vercel/next.js` | v16 |
| React | `/facebook/react` | v19.2 |
| MUI Material UI | `/mui/material-ui` | v7 |
| MUI X | `/mui/mui-x` | v9 |
| Emotion | `/emotion-js/emotion` | v11 |
| Firebase JS SDK | `/firebase/firebase-js-sdk` | v12 |
| Firebase Admin | `/firebase/firebase-admin-node` | v13 |
| Zod | `/colinhacks/zod` | v4 |
| dayjs | `/iamkun/dayjs` | v1 |
| TypeScript | `/microsoft/typescript` | v5 |
| Vitest | `/vitest-dev/vitest` | v4 |
| Playwright | `/microsoft/playwright` | v1 |
| Testing Library | `/testing-library/react-testing-library` | v16 |
| ESLint | `/eslint/eslint` | v9 |

## Query 作成

Query は具体的に書く。

- 悪い例: `Button`, `auth`
- 良い例: `Button component loading state MUI v7`, `Firestore transaction TypeScript Firebase JS SDK v12`, `Next.js 16 proxy matcher security headers`
