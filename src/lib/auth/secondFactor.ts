// ID トークン（Session Cookie）が SMS の2要素目を通ったものか。
// Firebase は2要素目を通ったトークンの firebase.sign_in_second_factor に 'phone' を入れる。
// MFA を登録していないアカウント（2要素目なしで通ったトークン）は、ここで止まる
export function hasPhoneSecondFactor(decoded: { firebase?: { sign_in_second_factor?: unknown } }): boolean {
  return decoded.firebase?.sign_in_second_factor === 'phone'
}
