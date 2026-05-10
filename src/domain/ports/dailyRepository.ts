export interface DailyRepository {
  // date: YYYY-MM-DD。ドキュメント未存在時は新規作成する
  updateSafeBalanceChecker(date: string, staffName: string): Promise<void>
  // 複数日付の safeBalanceChecker を一括取得。未存在のキーは空文字
  fetchSafeBalanceCheckers(dates: string[]): Promise<Record<string, string>>
  // date: YYYY-MM-DD。未存在時は空文字
  fetchDailyMemo(date: string): Promise<string>
  // date: YYYY-MM-DD。ドキュメント未存在時は新規作成する
  updateDailyMemo(date: string, memo: string): Promise<void>
}
