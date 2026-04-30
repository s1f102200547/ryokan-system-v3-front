# デイリーダッシュボード仕様書

## 概要

旅館業務の司令塔ページ。日付ナビゲーションと印刷機能を提供する。

## ルート

`/daily-dashboard`

## コンポーネント構成

```
page.tsx (Server Component)
  ↓ getTodayJST() を呼び initialDate として渡す
DailyDashboard.tsx (Client Component)
  ├── useDateNavigation(initialDate)
  ├── TimetablePrintContent — タイムテーブル印刷時のみマウント
  └── CleaningBoardPrintContent — 清掃ボード印刷時のみマウント
```

## 日付ナビゲーション

- Server Component が `getTodayJST()` で今日の日付を確定させ、`initialDate` として渡す
- `useDateNavigation(initialDate)` はクライアント側で日付 override を管理する
- `goToToday()` で `override = null` に戻ると `initialDate` (サーバー確定の今日) が使われる
- URL クエリには日付を持たない（クライアント state のみ）

### ナビゲーション UI 順序

```
< mm/dd (xxx) > 📅 Today
```

## インライン印刷

`printMode: 'timetable' | 'cleaning-board' | null` で制御。

1. 印刷ボタン押下 → `printMode` セット → PrintContent コンポーネントがマウント
2. PrintContent 内で API フェッチ（`useTimetable` / `useCleaningBoard`）
3. ロード中: Backdrop + CircularProgress をスクリーンに表示
4. エラー時: Backdrop 内に Alert + 閉じるボタン → `setPrintMode(null)`
5. データ取得完了: `window.print()` 呼び出し
6. `afterprint` イベント → `setPrintMode(null)` でコンポーネントをアンマウント

### 印刷レイアウト

各 PrintContent コンポーネントは `@media screen: display:none` / `@media print: display:block` で
スクリーンでは非表示、印刷時のみ表示する。

## テスト

- `e2e/daily-dashboard.spec.ts` — 日付ナビゲーション・タイムテーブル印刷コンテンツ・清掃ボード印刷コンテンツ
