// npm audit で high 以上でも CI を止めない脆弱性の例外リスト（docs/CICD.md「audit」）
//
// 追加の条件:
// - 依存の更新や overrides で解消できない
// - このアプリでは脆弱なコードが実行されないことを確認し、その理由を reason に書く
// - expires は最長3か月後。期限を過ぎると CI が再び失敗するので、上流の修正を確認して延長か削除を判断する
// 例外は「advisory の ID」と「脆弱なパッケージ名」の組で指定する。同じ ID でも別のパッケージ経路で出たら CI は失敗する

export type AuditAllowlistEntry = {
  id: string // GHSA ID
  package: string // 脆弱なパッケージ名（npm audit の advisory の name）
  reason: string
  expires: string // YYYY-MM-DD（JST）。この日を過ぎると例外が無効になる
}

// @firebase/firestore（ブラウザ用 firebase パッケージに同梱）が @grpc/grpc-js を ~1.9.0 に固定している。
// firebase 最新版（13.1.0 / @firebase/firestore 4.19.0）でも固定は変わらず、npm の修正案は firebase 9.14.0 へのダウングレード。
// - ブラウザでは firebase/app と firebase/auth だけを使い、firebase/firestore を import していないので、この grpc-js は読み込まれない
// - gRPC サーバー側（TLS のクライアント証明書の認可）の問題。このアプリは gRPC サーバーを動かさない
// - サーバー側の firebase-admin が使う grpc-js は修正済みの 1.14.x
// （同じ grpc-js の GHSA-f596-whhp-79r4 は low なので例外にしない）
export const AUDIT_ALLOWLIST: readonly AuditAllowlistEntry[] = [
  {
    id: 'GHSA-m9gg-hp2v-232j', // getAuthContext が未認可の証明書を認可済みとして返す（gRPC サーバーの TLS）
    package: '@grpc/grpc-js',
    reason:
      'firebase（ブラウザ用 SDK）の @firebase/firestore が grpc-js を ~1.9.0 に固定。firebase/firestore は import しておらず、脆弱性は gRPC サーバー側のみ',
    expires: '2027-01-31',
  },
]
