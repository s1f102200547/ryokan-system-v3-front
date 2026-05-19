import { VALID_ARRIVAL_TIMES } from '@/constants/timetable'

type Props = {
  checkInSlots: Record<string, string[]>
}

const TOTAL_COLUMNS = VALID_ARRIVAL_TIMES.length
const colWidth = `${100 / TOTAL_COLUMNS}%`

const headerCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  backgroundColor: '#f0f0f0',
  fontSize: '10px',
  textAlign: 'left',
  fontWeight: 'normal',
  width: colWidth,
}

const bodyCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  fontSize: '12px',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
  height: '70px',
  width: colWidth,
}

const elseCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  fontSize: '12px',
  verticalAlign: 'top',
  whiteSpace: 'pre',
  height: '70px',
  width: colWidth,
}

export function CheckInTime({ checkInSlots }: Props) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}
    >
      <thead>
        <tr>
          {VALID_ARRIVAL_TIMES.map((t) => (
            <th key={t} style={headerCellStyle}>
              {t}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {VALID_ARRIVAL_TIMES.map((t) => (
            <td
              key={t}
              style={t === '13:00以前' || t === '19:00以降' ? elseCellStyle : bodyCellStyle}
              data-testid={`checkin-slot-${t}`}
            >
              {(checkInSlots[t] ?? []).map((label, i) => (
                <div key={i}>{label}</div>
              ))}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
