import type { Result } from './result'

/*
type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E }
-> 型引数 T = userId: string, / E = 'invalid_credentials' を代入
type LoginResult =
  | { success: true; value: { userId: string } }
  | { success: false; error: 'invalid_credentials' }
*/
export type LoginResult = Result<{ userId: string }, 'invalid_credentials'>
