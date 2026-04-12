import { ROOM_NUMBERS } from '@/types/room'

type Props = {
  guestInfoRows: Record<string, string>
}

const tableStyle: React.CSSProperties = {
  width: '95%',
  borderCollapse: 'collapse',
  tableLayout: 'fixed',
  height: '100%',
  marginLeft: '5%',
}

const roomCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '8px',
  verticalAlign: 'middle',
  width: '40px',
  textAlign: 'center',
}

const infoCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  textAlign: 'center',
  height: '51px',
  overflow: 'hidden',
  padding: '4px',
}

const infoWrapperStyle: React.CSSProperties = {
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 3,
  overflow: 'hidden',
  whiteSpace: 'normal',
  lineHeight: '1.2em',
  fontSize: '10px',
}

export function GuestInfo({ guestInfoRows }: Props) {
  return (
    <table style={tableStyle}>
      <tbody>
        {ROOM_NUMBERS.map((room) => {
          const info = guestInfoRows[room] ?? '空室'
          const isVacant = info === '空室'
          return (
            <tr key={room}>
              <td style={roomCellStyle}>{room}</td>
              <td
                style={infoCellStyle}
                data-testid={isVacant ? 'guest-info-vacant' : `guest-info-row-${room}`}
              >
                <div style={infoWrapperStyle}>{info}</div>
              </td>
            </tr>
          )
        })}
        {/* 空行（v2 の 8 行目） */}
        <tr>
          <td style={roomCellStyle}></td>
          <td style={infoCellStyle}></td>
        </tr>
      </tbody>
    </table>
  )
}
