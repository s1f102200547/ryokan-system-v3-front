import { assertRuntimeEnv } from '@/lib/firebase/runtimeEnvGuard'

// 起動条件を満たさなければプロセスを終了する（instrumentation.ts から Node.js runtime でだけ呼ぶ）。
// throw だけでは next start / standalone server が待ち受けを続け、全リクエストに 500 を返す状態で残る。
// Cloud Run ではそれが「起動成功」と見なされトラフィックが移るため、終了して起動自体を失敗させる
export function enforceRuntimeEnv(): void {
  try {
    assertRuntimeEnv()
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  }
}
