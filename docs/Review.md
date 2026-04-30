# Review Guide

## 基本方針
- 機能を一通り実装した後、以下のレビュー項目に従ってgit push前にclaude code がレビューする。

## レビュー項目(優先度順)
- boundary value: [], null/undefined, 0, "" などが原因となるバグは発生しないか
- セキュリティ: 問題のある箇所がないか(Security.md参照)
- UI: errorUI・loading状態が適切に行われているか
- コード・アーキテクチャ：Next.js 16, React19, TypeScript5, MUI, Firebase,CloudRun, zod, Playwrite, Vitest を使用した プロジェクトとして適切か
- エラーハンドリング: 適切に行なっているか(ErrorHandling.md参照)
- パフォーマンス: 最適化されているか
- docs/*md, AGENTS.md と実際のコードが合っているか
