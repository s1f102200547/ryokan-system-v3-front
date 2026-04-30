import { ROOM_NUMBERS, CLEANING_BOARD_ROOM_NUMBERS } from '@/constants/room'

export { ROOM_NUMBERS, CLEANING_BOARD_ROOM_NUMBERS }
export type RoomNumber = (typeof ROOM_NUMBERS)[number]
export type CleaningBoardRoomNumber = (typeof CLEANING_BOARD_ROOM_NUMBERS)[number]