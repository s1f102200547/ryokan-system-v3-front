import { connection } from 'next/server'
import { LoginForm } from '@/components/auth/LoginForm'
import { parseRecaptchaSiteKey } from '@/lib/auth/recaptchaSiteKey'

// サイトキーは実行時の環境変数から読む（ビルドに埋め込まない。Cloud Run の設定だけで変えられる）
export default async function LoginPage() {
  await connection()
  return <LoginForm recaptchaSiteKey={parseRecaptchaSiteKey(process.env.RECAPTCHA_SITE_KEY)} />
}
