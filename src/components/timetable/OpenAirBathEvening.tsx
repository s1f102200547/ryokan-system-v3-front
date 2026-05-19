import { OPEN_AIR_TIMES_EVENING } from '@/constants/timetable'

type Props = {
  eveningBathSlots: Record<string, string[]>
}

const headerCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  backgroundColor: '#f0f0f0',
  width: `${100 / OPEN_AIR_TIMES_EVENING.length}%`,
  fontSize: '10px',
  textAlign: 'left',
  fontWeight: 'normal',
  padding: '1px 4px',
  boxSizing: 'border-box',
}

const bodyCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  position: 'relative',
  width: `${100 / OPEN_AIR_TIMES_EVENING.length}%`,
  fontSize: '18px',
  lineHeight: 1,
  textAlign: 'center',
  verticalAlign: 'middle',
  height: '28px',
  padding: '0 4px',
  boxSizing: 'border-box',
}

export function OpenAirBathEvening({ eveningBathSlots }: Props) {
  return (
    <table
      style={{
        width: '54%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        marginTop: '5px',
        marginBottom: '10px',
      }}
    >
      <thead>
        <tr>
          {OPEN_AIR_TIMES_EVENING.map((t) => (
            <th key={t} style={headerCellStyle}>
              {t}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {OPEN_AIR_TIMES_EVENING.map((t) => (
            <td key={t} style={bodyCellStyle} data-testid={`evening-bath-slot-${t}`}>
              <span>{(eveningBathSlots[t] ?? []).join('')}</span>
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: 4,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: '15px',
                  lineHeight: 1,
                }}
              >
                ▢
              </span>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
