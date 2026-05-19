type Props = {
  checkoutRooms: string[]
  lateCheckoutRooms: string[]
}

const headerCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  backgroundColor: '#f0f0f0',
  padding: '2px 8px',
  fontSize: '11px',
  textAlign: 'center',
  fontWeight: 'normal',
  boxSizing: 'border-box',
}

const bodyCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '0 8px',
  verticalAlign: 'middle',
  height: '28px',
  boxSizing: 'border-box',
}

const roomListStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-evenly',
  alignItems: 'center',
  height: '28px',
  overflow: 'hidden',
  fontSize: '16px',
  lineHeight: 1,
  whiteSpace: 'nowrap',
}

function RoomList({ rooms }: { rooms: string[] }) {
  return (
    <span style={roomListStyle}>
      {rooms.map((room) => (
        <span key={room}>{room}</span>
      ))}
    </span>
  )
}

export function CheckoutTime({ checkoutRooms, lateCheckoutRooms }: Props) {
  return (
    <table
      style={{
        width: '83.3%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <thead>
        <tr>
          <th style={{ ...headerCellStyle, width: '20%' }}>early</th>
          <th style={{ ...headerCellStyle, width: '60%' }}>通常</th>
          <th style={{ ...headerCellStyle, width: '20%' }}>late</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style={{ ...bodyCellStyle, width: '20%' }} />
          <td
            style={{ ...bodyCellStyle, width: '60%' }}
            data-testid="checkout-notice"
          >
            <RoomList rooms={checkoutRooms} />
          </td>
          <td
            style={{ ...bodyCellStyle, width: '20%' }}
            data-testid="late-checkout-notice"
          >
            <RoomList rooms={lateCheckoutRooms} />
          </td>
        </tr>
      </tbody>
    </table>
  )
}
