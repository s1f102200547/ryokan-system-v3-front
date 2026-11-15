import { MFA_CODE_LENGTH } from '@/constants/auth'

// ログイン画面の SMS のコードの入力を、送れる形（半角数字、MFA_CODE_LENGTH 桁まで）に直す（純粋。tests/unit/lib/mfaCodeInput.test.ts）。
// - 全角の数字は半角に直す（日本語入力がオンのまま打っても使える）
// - 空白とハイフンの類は黙って捨てる（SMS から「123 456」「123-456」の形で貼り付けたとき）
// - それ以外の文字（英字・かななど）は捨て、rejected で知らせる（画面が「半角の数字で」と出す）
// サーバーの確認（src/lib/api/loginSchema.ts の Zod。半角数字ちょうど MFA_CODE_LENGTH 桁）はそのまま。ここは打ちやすくするためだけ

// 空白（全角の空白・改行を含む）と、ハイフン・長音・ダッシュの類。NFKC のあとに残るもの
const SEPARATORS = /[\s\-‐‑‒–—―ー−]/g

export function sanitizeMfaCodeInput(raw: string): { digits: string; rejected: boolean } {
  const normalized = raw.normalize('NFKC').replace(SEPARATORS, '')
  const digits = normalized.replace(/[^0-9]/g, '')
  return { digits: digits.slice(0, MFA_CODE_LENGTH), rejected: digits.length !== normalized.length }
}
