import { OPEN_AIR_TIMES_EVENING } from '@/constants/timetable'

type Props = {
  eveningBathSlots: Record<string, string[]>
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #000',
  width: `${100 / OPEN_AIR_TIMES_EVENING.length}%`,
  fontSize: '10px',
  padding: '0 4px',
  boxSizing: 'border-box',
}

const innerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  height: '100%',
}

export function OpenAirBathEvening({ eveningBathSlots }: Props) {
  return (
    <table
      style={{
        width: '87.5%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        marginLeft: 'auto',
        marginTop: '5px',
        marginBottom: '10px',
        height: '25px',
        transform: 'translateX(-0.05%)',
      }}
    >
      <tbody>
        <tr>
          {OPEN_AIR_TIMES_EVENING.map((t) => (
            <td key={t} style={cellStyle} data-testid={`evening-bath-slot-${t}`}>
              <div style={innerStyle}>
                <span>{t}</span>
                <span style={{ fontSize: '18px', lineHeight: 1 }}>
                  {(eveningBathSlots[t] ?? []).join('')}
                </span>
                <span style={{ fontSize: '15px', lineHeight: 1 }}>▢</span>
              </div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
