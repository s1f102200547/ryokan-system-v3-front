// 分岐の網羅率を測る対象（docs/MfaBugHunt.md の S2）。ログインと SMS の2要素目に関わるコード。
// unit（vitest.config.ts）と Emulator（vitest.emulator.config.ts）で同じ対象を測り、通っていない分岐を突き合わせる。
// 実行: npm run coverage:auth（unit）/ npm run coverage:auth:emulator（Emulator）。結果は coverage/（Git の対象外）
export const AUTH_COVERAGE_TARGETS = [
  'src/app/api/auth/**',
  'src/app/login/**',
  'src/application/auth/**',
  'src/domain/auth/**',
  'src/infra/auth/**',
  'src/hooks/auth/**',
  'src/components/auth/**',
  'src/lib/auth/**',
  'src/lib/api/routeHelpers.ts',
  'src/lib/businessHours.ts',
]
