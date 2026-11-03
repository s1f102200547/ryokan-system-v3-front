type LogLevel = 'INFO' | 'WARN' | 'ERROR'

function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  // extra の message は detail に移す。そのまま展開すると本文（どの処理の何のログか）を上書きする
  const { message: detail, ...rest } = extra ?? {}
  // Cloud Run は stdout の JSON を Cloud Logging に自動収集する
  console.log(JSON.stringify({
    ...rest,
    ...(detail === undefined ? {} : { detail }),
    level,
    message,
    timestamp: new Date().toISOString(),
  }))
}

// extraがあったらRecord<stringのkey: unknownのvalue>を型制約する(Recordはts標準の型)
export const logger = {
  info:  (message: string, extra?: Record<string, unknown>) => log('INFO',  message, extra),
  warn:  (message: string, extra?: Record<string, unknown>) => log('WARN',  message, extra),
  error: (message: string, extra?: Record<string, unknown>) => log('ERROR', message, extra),
}
