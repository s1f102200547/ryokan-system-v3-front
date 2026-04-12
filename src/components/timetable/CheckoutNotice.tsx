type Props = {
  checkoutRooms: string[]
}

// 部屋マークを2個ずつ改行して並べる
function formatRooms(rooms: string[]): string {
  const lines: string[] = []
  for (let i = 0; i < rooms.length; i += 2) {
    lines.push(rooms.slice(i, i + 2).join('▢　'))
  }
  return lines.join('\n') + (rooms.length > 0 ? '▢' : '')
}

export function CheckoutNotice({ checkoutRooms }: Props) {
  return (
    <div
      data-testid="checkout-notice"
      style={{
        fontSize: '10px',
        whiteSpace: 'pre-wrap',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        position: 'relative',
        top: '40px',
        left: '15px',
      }}
    >
      <strong>本日のチェックアウト</strong>
      <span style={{ marginTop: '4px', fontSize: '13px' }}>
        {checkoutRooms.length > 0 ? formatRooms(checkoutRooms) : 'なし'}
      </span>
    </div>
  )
}
