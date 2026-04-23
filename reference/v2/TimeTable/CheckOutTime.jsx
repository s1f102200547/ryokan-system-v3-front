// src/CheckOutTime.js
export default function CheckOutTime({ lateOutStr }) {
  // 最終「11:00」まで含めて6列
  const times = ['7:30', '8:00', '8:30', '9:00', '9:30', '11:00'];

  const tableStyle = {
    width: '99.9%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  };
  const cellStyle = {
    border: '1px solid #000',
    padding: '8px',
    verticalAlign: 'middle',
    fontSize: '11px',
    textAlign: 'left',
  };
  const markStyle = { fontSize: "18px", lineHeight: 1 };

  return (
    <table style={tableStyle}>
      <tbody>
        <tr>
          {times.map((t, i) => {
            if (t === '11:00') {
              return (
                <td
                  key={i}
                  style={{
                    ...cellStyle,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ flex: 1, textAlign: 'center', ...markStyle }}>
                    {lateOutStr || ''}
                  </span>
                  <span style={{ textAlign: 'left' }}>
                    {t}
                  </span>
                </td>
              );
            }
            return (
              <td key={i} style={cellStyle}>
                {t}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}