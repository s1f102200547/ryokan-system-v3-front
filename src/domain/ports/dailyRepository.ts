export interface DailyRepository {
  // date: YYYY-MM-DD。ドキュメント未存在時は新規作成する
  updateSafeBalanceChecker(date: string, staffName: string): Promise<void>
}
