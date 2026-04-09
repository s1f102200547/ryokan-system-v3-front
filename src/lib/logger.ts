type LogLevel = 'INFO' | 'WARN' | 'ERROR'

function log(level: LogLevel, message: string, extra?: Record<string, unknown>): void {
  // Cloud Run は stdout の JSON を Cloud Logging に自動収集する
  console.log(JSON.stringify({ level, message, timestamp: new Date().toISOString(), ...extra }))
}

// extraがあったらRecord<stringのkey: unknownのvalue>を型制約する(Recordはts標準の型)
export const logger = {
  info:  (message: string, extra?: Record<string, unknown>) => log('INFO',  message, extra),
  warn:  (message: string, extra?: Record<string, unknown>) => log('WARN',  message, extra),
  error: (message: string, extra?: Record<string, unknown>) => log('ERROR', message, extra),
}
