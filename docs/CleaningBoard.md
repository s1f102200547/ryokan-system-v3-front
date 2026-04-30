## 概要

清掃ボード機能（`/cleaning-board`）をゼロから実装した。掃除スタッフが当日の部屋状態を確認しA4横向きで印刷できるUIを提供する。

---

## 実装内容

### Domain（ビジネスロジック）
- `src/domain/room/roomState.ts` — `computeRoomCheckInState()` を実装
  - 予約一覧と対象日から部屋ごとの状態を計算（連泊・チェックイン・空室・レイトアウト等）
  - 変数間の含意ルールを定義し、複雑な状態の組み合わせをカプセル化
  - Unit test（`roomState.test.ts`）

### Infra
- `firestoreReservationRepository.ts` — Firestore `guestInfoV2` コレクションから日付範囲で予約を取得
  - Zod で入力データを検証、`YYYY/MM/DD` → `YYYY-MM-DD` 変換
  - 空の room フィールドを `null`（未割り当て）に変換

### Application
- `getCleaningBoardUseCase.ts` — 対象日 ±30日の予約を取得し、7部屋分の `CleaningBoardRow` を生成
  - `autoNotes` として「レイトアウト」「前日空室セットアップ済み」「本日空室」の自動メモを生成
  - 部屋未割り当ての予約を別途収集して警告表示に使用

### API Route / Hooks
- `GET /api/cleaning-board?date=YYYY-MM-DD` — Zod でクエリパラメータ検証、JSON レスポンス
  - Integration test: `route.test.ts`（117行）
- `useCleaningBoard(targetDate)` — API fetch + ローディング・エラー状態管理

### UI
- `CleaningBoardTable` — 18列固定テーブル（37単位グリッド、A4横向き印刷対応）
  - 連泊〜ライト(連泊) の13列ヘッダーを縦書き（`<span>` に `writing-mode: vertical-rl` を適用）
  - `th` 直接への `writing-mode` 適用はテーブル列順が逆転するバグのため span でラップ
- `CleaningBoardFooter` — 共有エリアタスクチェックリスト（5Fトイレ〜アメニティセット）
- `CleaningBoardNotes` — 備考／引継ぎセクション（autoNotes を一覧表示、`data-testid="auto-notes-box"`）
- `page.tsx` — 日付ヘッダー・印刷ボタン・未割り当て警告・print-area 構成

### E2E テスト
- `e2e/cleaning-board.spec.ts` — チェックイン人数・連泊表示・備考欄・空室警告の主要フローを検証

---

## テスト計画

- [ ] `localhost:3000/cleaning-board` でテーブルが正しく表示されること
- [ ] A4横向き印刷プレビューでテーブル・フッター・備考が1ページに収まること
- [ ] 未割り当て予約がある場合に警告が表示されること
- [ ] `npx playwright test e2e/cleaning-board.spec.ts` が全パスすること