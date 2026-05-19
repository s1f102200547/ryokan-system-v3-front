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
  flex: '1 1 0',
  minHeight: '70px',
  overflow: 'hidden',
  display: 'grid',
  gridTemplateRows: '18px 1fr',
}

const headerStyle: React.CSSProperties = {
  borderBottom: '1px solid #000',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '6px',
  fontSize: '10px',
  lineHeight: '1.1em',
  padding: '2px 4px',
  whiteSpace: 'nowrap',
  overflow: 'hidden',
}

const headerItemStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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

export function GuestInfo({ guestInfoRows }: Props) {
  const displayRooms = [...ROOM_NUMBERS].reverse()

  return (
    <div style={listStyle}>
      {displayRooms.map((room) => {
        const row = guestInfoRows[room] ?? fallbackRow(room)
        const isVacant = row.memo === '空室'
        return (
          <div
            key={room}
            style={itemStyle}
            data-testid={isVacant ? 'guest-info-vacant' : `guest-info-row-${room}`}
          >
            <div style={headerStyle}>
              <span style={{ ...headerItemStyle, flex: '0 0 auto' }}>{row.room}号室</span>
              {row.guestName !== '' && (
                <span style={{ ...headerItemStyle, flex: '1 1 auto' }}>{row.guestName}</span>
              )}
              {row.guestCountLabel !== '' && (
                <span style={{ ...headerItemStyle, flex: '0 0 auto' }}>{row.guestCountLabel}</span>
              )}
              {row.stayProgressLabel !== '' && (
                <span style={{ ...headerItemStyle, flex: '0 0 auto' }}>{row.stayProgressLabel}</span>
              )}
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
