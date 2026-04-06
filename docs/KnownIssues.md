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

## CleaningBoardの警告はcheck_in_dateだけ
- 現在の仕様は警告は check_in_date だけ表示
- 本来は check_in_date + guest_name を警告表示したほうがわかりやすい
- infraで guest_name 取得してないところに警告のためだけに取得するのは面倒なのでとりあえずは現在の仕様のままにする

## boolenと1/0の混在
- 現在はlateoutやcancelなどは1/0になっている。
- 本来はboolenに統一したい。
- 従来のdb構造を引き継ぐ必要があるのでとりあえず放置している

## zapで見つかった問題(解決予定)
- Content Security Policy (CSP) Header Not Set [10038]
- Missing Anti-clickjacking Header [10020]
- Cross-Origin-Embedder-Policy Header Missing or Invalid [90004]
- Cross-Origin-Opener-Policy Header Missing or Invalid [90004]
- Cross-Origin-Resource-Policy Header Missing or Invalid [90004]
- Permissions Policy Header Not Set [10063]
- Server Leaks Information via "X-Powered-By" HTTP Response Header Field(s)
- X-Content-Type-Options Header Missing [10021]

## zapで見つかった問題(解決予定なし)
- Modern Web Application[10109]
- Content-Type Header Missing [10019]
- Storable and Cacheable Content [10049]
- Non-Storable Content [10049]
- Storable but Non-Cacheable Content [10049]