export type UseDateNavigationReturn = {
  selectedDate: string
  dateLabel: string
  diffLabel: string
  goToPrevDay: () => void
  goToNextDay: () => void
  goToToday: () => void
}
