type Props = {
  checkoutRooms: string[]
  lateCheckoutRooms: string[]
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '8px',
  verticalAlign: 'middle',
  fontSize: '11px',
  textAlign: 'left',
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
      <tbody>
        <tr>
          <td style={{ ...cellStyle, width: '20%' }}>early</td>
          <td
            style={{ ...cellStyle, width: '60%' }}
            data-testid="checkout-notice"
          >
            <div>
              <span>通常</span>
              <span style={{ display: 'block', textAlign: 'center', fontSize: '18px', lineHeight: 1 }}>
                {checkoutRooms.join('')}
              </span>
            </div>
          </td>
          <td
            style={{ ...cellStyle, width: '20%' }}
            data-testid="late-checkout-notice"
          >
            <div>
              <span>late</span>
              <span style={{ display: 'block', textAlign: 'center', fontSize: '18px', lineHeight: 1 }}>
                {lateCheckoutRooms.join('')}
              </span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  )
}
