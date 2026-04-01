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

## addDaysの重複定義
addDays は getCleaningBoardUseCase.tsとroomState.ts 内にも private で存在するが、Application層は domain にしか依存できない。 domain から export してもよいが、日付ユーティリティをエクスポートするのは責務的に違和感あり。 → UseCase ファイル内に private 実装として持つ。