import { VALID_ARRIVAL_TIMES } from '@/constants/timetable'

type Props = {
  checkInSlots: Record<string, string[]>
}

// 全列数 = VALID_ARRIVAL_TIMES(7) + "その他"(1) = 8
const TOTAL_COLUMNS = VALID_ARRIVAL_TIMES.length + 1
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
  fontSize: '10px',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
  height: '100px',
  width: colWidth,
}

const elseCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  fontSize: '10px',
  verticalAlign: 'top',
  whiteSpace: 'pre',
  width: colWidth,
}

export function CheckInTime({ checkInSlots }: Props) {
  const otherItems = checkInSlots['OTHER'] ?? []

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
          <th style={headerCellStyle}>その他</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          {VALID_ARRIVAL_TIMES.map((t) => (
            <td
              key={t}
              style={bodyCellStyle}
              data-testid={`checkin-slot-${t}`}
            >
              {(checkInSlots[t] ?? []).map((label, i) => (
                <div key={i}>{label}</div>
              ))}
            </td>
          ))}
          <td style={elseCellStyle} data-testid="checkin-slot-OTHER">
            {otherItems.map((label, i) => (
              <div key={i}>{label}</div>
            ))}
          </td>
        </tr>
      </tbody>
    </table>
  )
}
