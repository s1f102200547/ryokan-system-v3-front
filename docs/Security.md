````md
# Middleware

2025年にCVSS 9.1の脆弱性が公開され、  
`x-middleware-subrequest` ヘッダーを送信するだけで  
**Middlewareのロジック（認証チェック含む）をバイパスできる**問題が発生した。

## 教訓

> Middlewareはセキュリティ境界ではない

認証・認可は必ず以下で実施する：

- Route Handler（API）
- Server Action
- Data Access Layer

## 責務分離

- Middleware → UX用途（リダイレクト、軽微な制御）
- 各API / Server → 認証チェック
- DBアクセス前 → 認可チェック

---

# セキュリティヘッダー

XSS・クリックジャッキング・情報漏洩対策としてセキュリティヘッダーを設定する。  
nonceを利用するため、`next.config.ts` ではなく Middleware で付与する。

## 主なヘッダー

### Strict-Transport-Security
中間者攻撃によりHTTPS通信をHTTPにダウングレードされるのを防ぐ。

---

### Content-Security-Policy (CSP)
ブラウザが読み込めるリソース（script / style / image 等）をホワイトリスト形式で制御し、悪意あるスクリプトの実行を防ぐ。

---

### nonceベースCSP

リクエストごとにランダムな nonce（number used once）を生成し、  
一致する `nonce` を持つスクリプトのみ実行を許可する。

```js
Content-Security-Policy: script-src 'nonce-abc123'
````

```html
<script nonce="abc123">
  // 実行される
</script>

<script nonce="xyz999">
  // 実行されない
</script>

<script>
  // nonceなし → 実行されない
</script>
```

---

### X-Content-Type-Options

MIMEスニッフィングを無効化し、ブラウザに指定されたContent-Type通りの挙動を強制する。

---

### X-Frame-Options

iframe埋め込みを制御し、クリックジャッキング攻撃を防止する。

---

### Referrer-Policy

外部サイトへ遷移する際に送信されるリファラ情報を制御する。

URLにトークン等が含まれる場合の情報漏洩を防ぐ。

---

### Permissions-Policy

カメラ・マイク・位置情報などのブラウザ機能の利用を制限する。

---

### Cross-Origin-Opener-Policy (COOP)

他オリジンからのウィンドウ操作・参照を制限し、分離状態を作る。

---

### Cross-Origin-Embedder-Policy (COEP)

他ドメインのリソース（画像・スクリプト等）の利用を制限する。

---

# 旅館管理システムにおけるCSP設定

CSPの `connect-src` に以下のドメインを追加する必要がある：

* https://*.firebaseio.com

  * Firestore

* [https://identitytoolkit.googleapis.com](https://identitytoolkit.googleapis.com)

  * Firebase Auth

* [https://securetoken.googleapis.com](https://securetoken.googleapis.com)

  * Firebase Auth トークンリフレッシュ

---

# MUI使用時の注意点

Material UI（MUI）を使用する場合：

* CSS-in-JSによりインラインスタイルが生成される
* そのため `style-src` に `'unsafe-inline'` が必要になる可能性がある

## 回避方法

nonce対応を行うことで回避可能：

* CacheProvider
* prepend設定
* nonceの注入

ただし実装が複雑になるため：

> まずは `Content-Security-Policy-Report-Only` で検証し、
> 問題を確認した上で本番適用するのが安全

```
```
