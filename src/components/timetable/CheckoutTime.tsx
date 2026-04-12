const CHECKOUT_TIMES = ['7:30', '8:00', '8:30', '9:00', '9:30', '11:00'] as const

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
          {CHECKOUT_TIMES.map((t) => {
            if (t === '11:00') {
              return (
                <td
                  key={t}
                  style={{ ...cellStyle, display: 'flex', alignItems: 'center' }}
                  data-testid="late-checkout-notice"
                >
                  <span style={{ flex: 1, textAlign: 'center', fontSize: '18px', lineHeight: 1 }}>
                    {lateCheckoutRooms.join('')}
                  </span>
                  <span>{t}</span>
                </td>
              )
            }
            return (
              <td key={t} style={cellStyle}>
                {t}
              </td>
            )
          })}
        </tr>
      </tbody>
    </table>
  )
}
