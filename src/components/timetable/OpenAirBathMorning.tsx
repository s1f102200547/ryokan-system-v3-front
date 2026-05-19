import { OPEN_AIR_TIMES_MORNING } from '@/constants/timetable'

type Props = {
  morningBathSlots: Record<string, string[]>
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #000',
  padding: '6px',
  verticalAlign: 'middle',
  width: `${100 / OPEN_AIR_TIMES_MORNING.length}%`,
  boxSizing: 'border-box',
}

export function OpenAirBathMorning({ morningBathSlots }: Props) {
  return (
    <table
      style={{
        width: '83.3%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        marginTop: '5px',
      }}
    >
      <tbody>
        <tr>
          {OPEN_AIR_TIMES_MORNING.map((t) => (
            <td key={t} style={cellStyle} data-testid={`morning-bath-slot-${t}`}>
              <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: '18px',
                    lineHeight: 1,
                  }}
                >
                  {(morningBathSlots[t] ?? []).join('')}
                </span>
                <span style={{ fontSize: '11px' }}>{t}</span>
              </div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
