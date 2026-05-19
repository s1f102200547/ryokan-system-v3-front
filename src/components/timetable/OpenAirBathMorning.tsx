import { OPEN_AIR_TIMES_MORNING } from '@/constants/timetable'

type Props = {
  morningBathSlots: Record<string, string[]>
}

const headerCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  backgroundColor: '#f0f0f0',
  width: `${100 / OPEN_AIR_TIMES_MORNING.length}%`,
  fontSize: '10px',
  textAlign: 'left',
  fontWeight: 'normal',
  padding: '1px 4px',
  boxSizing: 'border-box',
}

const bodyCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  width: `${100 / OPEN_AIR_TIMES_MORNING.length}%`,
  fontSize: '18px',
  lineHeight: 1,
  textAlign: 'center',
  verticalAlign: 'middle',
  height: '28px',
  padding: '0 4px',
  boxSizing: 'border-box',
}

export function OpenAirBathMorning({ morningBathSlots }: Props) {
  return (
    <table
      style={{
        width: '66.6%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        marginTop: '5px',
      }}
    >
      <thead>
        <tr>
          {OPEN_AIR_TIMES_MORNING.map((t) => (
            <th key={t} style={headerCellStyle}>
              {t}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {OPEN_AIR_TIMES_MORNING.map((t) => (
            <td key={t} style={bodyCellStyle} data-testid={`morning-bath-slot-${t}`}>
              {(morningBathSlots[t] ?? []).join('')}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
