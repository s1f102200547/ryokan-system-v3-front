'use client'

import { MFA_RECAPTCHA_ACTION, RECAPTCHA_ENTERPRISE_SCRIPT_URL } from '@/constants/auth'

// reCAPTCHA Enterprise の token を作る（ログイン画面だけが使う）。Identity Platform は SMS を送る前にこの token を求める。
// 画像の問題は出ない（点数で判断する方式）。token は使い捨てで数分で切れるので、送る直前に毎回作る。
// script はこちらの script（nonce 付き）が足すので、CSP の 'strict-dynamic' で動く（src/lib/csp.ts）
type Enterprise = {
  ready(callback: () => void): void
  execute(siteKey: string, options: { action: string }): Promise<string>
}

declare global {
  interface Window {
    grecaptcha?: { enterprise?: Enterprise }
  }
}

const LOAD_TIMEOUT_MS = 10_000
let loading: Promise<Enterprise> | null = null

function load(siteKey: string): Promise<Enterprise> {
  const ready = window.grecaptcha?.enterprise
  if (ready) return Promise.resolve(ready)
  loading ??= new Promise<Enterprise>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${RECAPTCHA_ENTERPRISE_SCRIPT_URL}?render=${encodeURIComponent(siteKey)}`
    script.async = true
    const timer = setTimeout(() => reject(new Error('reCAPTCHA timeout')), LOAD_TIMEOUT_MS)
    script.onload = () => {
      clearTimeout(timer)
      const enterprise = window.grecaptcha?.enterprise
      if (enterprise) resolve(enterprise)
      else reject(new Error('reCAPTCHA not available'))
    }
    script.onerror = () => {
      clearTimeout(timer)
      reject(new Error('reCAPTCHA load failed'))
    }
    document.head.append(script)
  }).catch((e: unknown) => {
    loading = null // 次に押したときに読み込み直す
    throw e
  })
  return loading
}

// サイトキーごとの token の作り方。失敗（読み込めない・Google に届かない）は reject する
export function createRecaptchaTokenGetter(siteKey: string): () => Promise<string> {
  return async () => {
    const enterprise = await load(siteKey)
    return new Promise<string>((resolve, reject) => {
      enterprise.ready(() => { enterprise.execute(siteKey, { action: MFA_RECAPTCHA_ACTION }).then(resolve, reject) })
    })
  }
}
