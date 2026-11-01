// サーバー起動時に1回だけ呼ばれる。Node.js runtime でだけ起動条件を検査する
// （Edge 向けの bundle に process.exit を含めないよう、Next.js docs の書き方で分岐する）
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { enforceRuntimeEnv } = await import('@/lib/firebase/enforceRuntimeEnv')
    enforceRuntimeEnv()
  }
}
