// CleaningBoardを作成する時の部屋ごとの1列ずつのデータ
export type CleaningBoardRow = {
  room: string
  isTodayCheckIn: boolean
  isFutureCheckIn: boolean
  checkInReservation: {
    adult_count: number
    child_count: number
  } | null
}
