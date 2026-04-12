const BREAKFAST_HEADER_TIMES = ['7:30', '8:00', '8:30', '9:00', '9:30'] as const

type Props = {
  nextDateLabel: string // 例: "4/13"
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #000',
  borderBottom: 'none',
  textAlign: 'center',
  verticalAlign: 'middle',
  width: `${100 / BREAKFAST_HEADER_TIMES.length}%`,
  fontWeight: 'normal',
  fontSize: '11px',
}

export function BreakfastHeader({ nextDateLabel }: Props) {
  return (
    <>
      <div style={{ fontSize: '11px', marginBottom: '2px' }}>{nextDateLabel}</div>
      <table
        style={{
          width: '83.3%',
          borderCollapse: 'collapse',
          tableLayout: 'fixed',
          backgroundColor: '#f0f0f0',
        }}
      >
        <thead>
          <tr>
            {BREAKFAST_HEADER_TIMES.map((t) => (
              <th key={t} style={cellStyle}>
                {t}
              </th>
            ))}
          </tr>
        </thead>
      </table>
    </>
  )
}
