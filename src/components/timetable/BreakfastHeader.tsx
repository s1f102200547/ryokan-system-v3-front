import { BREAKFAST_HEADER_TIMES } from '@/constants/timetable'

const cellStyle: React.CSSProperties = {
  border: '1px solid #000',
  borderBottom: 'none',
  textAlign: 'center',
  verticalAlign: 'middle',
  width: `${100 / BREAKFAST_HEADER_TIMES.length}%`,
  fontWeight: 'normal',
  fontSize: '11px',
}

export function BreakfastHeader() {
  return (
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
  )
}
