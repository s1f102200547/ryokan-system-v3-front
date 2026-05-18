import { ROOM_NUMBERS } from '@/types/room'
import type { TimetableGuestInfoRow } from '@/types/timetable'

type Props = {
  guestInfoRows: Record<string, TimetableGuestInfoRow>
}

const listStyle: React.CSSProperties = {
  width: '95%',
  height: '100%',
  marginLeft: '5%',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const itemStyle: React.CSSProperties = {
  border: '1px solid #000',
  minHeight: '65px',
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: '18px 1fr',
}

const headerStyle: React.CSSProperties = {
  borderBottom: '1px solid #000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '4px',
  fontSize: '10px',
  lineHeight: '1.1em',
  padding: '2px 4px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}

const infoStyle: React.CSSProperties = {
  textAlign: 'center',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '4px',
}

const infoWrapperStyle: React.CSSProperties = {
  whiteSpace: 'normal',
  overflowWrap: 'break-word',
  lineHeight: '1.2em',
  fontSize: '10px',
}

function fallbackRow(room: string): TimetableGuestInfoRow {
  return { room, guestName: '', guestCountLabel: '', stayProgressLabel: '', memo: '空室' }
}

function headerLabel(row: TimetableGuestInfoRow): string {
  const details = [row.guestName, row.guestCountLabel, row.stayProgressLabel]
    .filter((value) => value !== '')
    .join(' ')
  return details === '' ? `${row.room}号室` : `${row.room}号室 ${details}`
}

export function GuestInfo({ guestInfoRows }: Props) {
  return (
    <div style={listStyle}>
      {ROOM_NUMBERS.map((room) => {
        const row = guestInfoRows[room] ?? fallbackRow(room)
        const isVacant = row.memo === '空室'
        return (
          <div
            key={room}
            style={itemStyle}
            data-testid={isVacant ? 'guest-info-vacant' : `guest-info-row-${room}`}
          >
            <div style={headerStyle}>
              {headerLabel(row)}
            </div>
            <div style={infoStyle}>
              <div style={infoWrapperStyle}>{row.memo}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
