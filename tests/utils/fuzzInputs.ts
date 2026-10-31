// ファジングの入力（BugHunting.md §3.3）。判定は「入力が原因で 5xx を返さない・Slack に通知しない」。
// 入力の一覧はここに1つにまとめ、mock 版（tests/integration/fuzz/）と Emulator 版（tests/emulator/）で共有する

// request.json() に渡す生の body
export const RAW_BODIES: ReadonlyArray<readonly [label: string, raw: string]> = [
  ['空', ''],
  ['不正な JSON', '{'],
  ['途中で切れた JSON', '{"a":'],
  ['null', 'null'],
  ['配列', '[]'],
  ['文字列', '"x"'],
  ['数値', '0'],
  ['真偽値', 'true'],
  ['空オブジェクト', '{}'],
  ['__proto__', '{"__proto__":{"polluted":true}}'],
  ['constructor', '{"constructor":{"prototype":{"polluted":true}}}'],
  ['深い入れ子（JSON.parse の再帰の上限）', '['.repeat(200_000) + ']'.repeat(200_000)],
  ['巨大な文字列（2MB）', JSON.stringify({ x: 'a'.repeat(2_000_000) })],
  ['NUL 文字', '{"x":"\\u0000"}'],
]

// 正しい body の1フィールドを置き換える値
export const FIELD_VALUES: ReadonlyArray<readonly [label: string, value: unknown]> = [
  ['null', null],
  ['空文字', ''],
  ['空白', ' '],
  ['負の数', -1],
  ['0', 0],
  ['小数', 1.5],
  ['巨大な数', 1e308],
  ['true', true],
  ['空配列', []],
  ['空オブジェクト', {}],
  ['[null]', [null]],
  ['巨大な文字列', 'x'.repeat(100_000)],
  ['巨大な配列', Array(10_000).fill('NONE')],
  ['NUL 文字', '\u0000'],
  ['HTML', '<script>alert(1)</script>'],
  ['パス', '../../etc/passwd'],
  ['演算子オブジェクト', { $gt: '' }],
  ['実在しない日付', '2026-02-30'],
  ['NaN の文字列', 'NaN'],
]

// [id]（Firestore のドキュメント ID）
// invalid: Firestore の ID の制約に反する（400 になるべき）。false は奇妙だが ID として有効（存在しなければ 404）
export const ID_VALUES: ReadonlyArray<readonly [label: string, id: string, invalid: boolean]> = [
  ['空', '', true],
  ['スラッシュ', 'a/b', true],
  ['.', '.', true],
  ['..', '..', true],
  ['パス', '../secret', true],
  ['予約名', '__x__', true],
  ['1500 バイト超（マルチバイト）', 'あ'.repeat(501), true],
  ['1500 バイト超（ASCII）', 'x'.repeat(1501), true],
  ['空白', ' ', false],
  ['NUL 文字', '\u0000', false],
  ['エンコードされたスラッシュの文字列', '%2F', false],
]

// 日付（path の [date] と query の date）
export const DATE_VALUES: ReadonlyArray<readonly [label: string, date: string]> = [
  ['空', ''],
  ['実在しない日', '2026-02-30'],
  ['実在しない月', '2026-13-01'],
  ['0 年 0 月 0 日', '0000-00-00'],
  ['遠い未来', '9999-12-31'],
  ['0 埋めなし', '2026-5-20'],
  ['時刻つき', '2026-05-20T00:00:00Z'],
  ['スラッシュ区切り', '2026/05/20'],
  ['パス', '../2026-05-20'],
  ['入力途中の値', 'Invalid Date'],
  ['全角数字', '２０２６-０５-２０'],
]

// 数値の query（year / month）
export const NUMBER_QUERY_VALUES: ReadonlyArray<readonly [label: string, value: string]> = [
  ['空', ''],
  ['文字', 'abc'],
  ['負', '-1'],
  ['指数表記', '1e3'],
  ['小数', '2026.5'],
  ['巨大', '99999999999999999999'],
  ['前後に空白', ' 2026 '],
  ['16 進', '0x7EA'],
  ['Infinity', 'Infinity'],
  ['NaN', 'NaN'],
  ['全角数字', '２０２６'],
]
