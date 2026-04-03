/*
プロジェクト共通の部屋番号定数

as const によって：string[] ではなく "21" | "22" | ... というリテラル型の配列（中身の値そのものが“型”になっている配列）
✅ この型を使うと
let room: RoomNumber = "21" // OK
let room2: RoomNumber = "99" // ❌ エラー
👉 存在しない部屋をコンパイル時に弾ける

配列[number] -> は「どの番号でもいいから1個取り出す」という意味
*/
export const ROOM_NUMBERS = ['21', '22', '31', '32', '42', '43', '61'] as const
export type RoomNumber = (typeof ROOM_NUMBERS)[number]