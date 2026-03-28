# Known Issues

## firebase-admin の間接依存に low severity の脆弱性（8件）

**状態**: 未修正（対応不要）

**概要**

`firebase-admin` → `@google-cloud/*` → `teeny-request` → `http-proxy-agent` → `@tootallnate/once` の依存チェーンに Incorrect Control Flow Scoping の脆弱性がある。

**対応しない理由**

- severity が low で、旅館アプリではこのコードパスを直接使わない
- `npm audit fix --force` を実行すると `firebase-admin` が `10.3.0` にダウングレードされ、Firestore / Auth の API が破壊的に変わる
- 修正は `firebase-admin` 側の依存更新待ち
