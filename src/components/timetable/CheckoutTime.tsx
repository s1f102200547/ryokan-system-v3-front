type Props = {
  lateCheckoutRooms: string[]
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '8px',
  verticalAlign: 'middle',
  fontSize: '11px',
  textAlign: 'left',
}

export function CheckoutTime({ lateCheckoutRooms }: Props) {
  return (
    <table
      style={{
        width: '99.9%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <tbody>
        <tr>
          <td style={{ ...cellStyle, width: '20%' }}>early</td>
          <td style={{ ...cellStyle, width: '60%' }}>通常</td>
          <td
            style={{ ...cellStyle, width: '20%' }}
            data-testid="late-checkout-notice"
          >
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ flex: 1, textAlign: 'center', fontSize: '18px', lineHeight: 1 }}>
                {lateCheckoutRooms.join('')}
              </span>
              <span>late</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}
