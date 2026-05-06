import type { BookingSite } from '@/types/guestInfo'

export function isATaxExempt(bookingSite: BookingSite): boolean {
  return bookingSite === 'chillnn'
}

// Chillnn以外の予約の宿泊税計算（呼び出し元でisATaxExempt確認済み前提）
export function calcATax(
  adultCount: number,
  nights: number,
  ratePerPersonPerNight: number,
): number {
  return adultCount * nights * ratePerPersonPerNight
}
