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

// 部屋未割り当ての予約（警告表示用）
export type UnassignedReservation = {
  id: string
  check_in_date: string // YYYY-MM-DD
}

// API レスポンス全体
export type CleaningBoardData = {
  rows: CleaningBoardRow[]
  unassignedReservations: UnassignedReservation[]
}
