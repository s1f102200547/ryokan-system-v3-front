// Auth Emulator が「送った」SMS のコードを読む（Emulator 専用の REST。本番の Auth にはこの API はない）。
// 呼ぶ前に checkSeedTarget で、接続先がローカルの Emulator と demo- の project であることを確かめる
export type EmulatorSmsCode = { phoneNumber?: string; sessionInfo?: string; code?: string }

export async function listEmulatorSmsCodes(authHost: string, projectId: string): Promise<EmulatorSmsCode[]> {
  const res = await fetch(`http://${authHost}/emulator/v1/projects/${projectId}/verificationCodes`)
  if (!res.ok) throw new Error(`Auth Emulator から SMS のコードを読めない（status ${res.status}）`)
  const body = (await res.json()) as { verificationCodes?: EmulatorSmsCode[] }
  return body.verificationCodes ?? []
}

// その電話番号に最後に送ったコード
export async function latestEmulatorSmsCode(authHost: string, projectId: string, phoneNumber: string): Promise<string | null> {
  const codes = await listEmulatorSmsCodes(authHost, projectId)
  return codes.filter((c) => c.phoneNumber === phoneNumber).at(-1)?.code ?? null
}
