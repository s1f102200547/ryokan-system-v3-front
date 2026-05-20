export type UseDateNavigationReturn = {
  selectedDate: string
  dateLabel: string
  diffLabel: string
  setDate: (date: string) => void
  goToPrevDay: () => void
  goToNextDay: () => void
  goToToday: () => void
  isPrevDisabled: boolean
  isNextDisabled: boolean
  minDate: string
  maxDate: string
  outOfRangeWarning: string | null
}
