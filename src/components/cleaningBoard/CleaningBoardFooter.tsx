const cellStyle: React.CSSProperties = {
  border: '0.5px solid #000',
  padding: '4px 2px',
  textAlign: 'center',
  verticalAlign: 'middle',
}

const footerLeft = ['5Fトイレ', '6Fトイレ', '露天', '共有シャワー', 'ヘアキャッチャー', '各階廊下']
const footerRight = ['はがし', 'フロア清掃', '水回り清掃', '布団セット', 'アメニティセット']

export function CleaningBoardFooter() {
  return (
    <div style={{ display: 'flex', width: '100%', marginTop: 12, gap: 8 }}>
      <table
        style={{
          width: '30%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          borderSpacing: 0,
          fontSize: '8pt',
        }}
      >
        <tbody>
          {footerLeft.map((label) => (
            <tr key={label}>
              <td style={{ ...cellStyle, width: '60%', textAlign: 'left', paddingLeft: 4 }}>{label}</td>
              <td style={cellStyle} />
            </tr>
          ))}
        </tbody>
      </table>

      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '9pt',
        }}
      >
        露天スイッチ →{' '}
        <span style={{ fontSize: '3em', display: 'inline-block', lineHeight: 1 }}>□</span>
      </div>

      <table
        style={{
          width: '30%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          borderSpacing: 0,
          fontSize: '8pt',
        }}
      >
        <tbody>
          {footerRight.map((label) => (
            <tr key={label}>
              <td style={{ ...cellStyle, width: '60%', textAlign: 'left', paddingLeft: 4 }}>{label}</td>
              <td style={cellStyle} />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
