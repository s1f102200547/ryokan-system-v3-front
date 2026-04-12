import { DINNER_TIME_KEYS } from '@/constants/timetable'

type Props = {
  dinnerSlots: Record<string, string[]>
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #000',
  fontWeight: 'normal',
  fontSize: '9px',
  verticalAlign: 'middle',
  width: `${100 / DINNER_TIME_KEYS.length}%`,
}

export function Dinner({ dinnerSlots }: Props) {
  return (
    <table
      style={{
        width: '87.5%',
        borderCollapse: 'collapse',
        tableLayout: 'fixed',
        height: '100px',
        marginLeft: '12.4%',
      }}
    >
      <thead>
        <tr>
          {DINNER_TIME_KEYS.map((t) => (
            <th key={t} style={{ ...cellStyle, textAlign: 'center' }}>
              {t}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {DINNER_TIME_KEYS.map((t) => (
            <td
              key={t}
              style={{ ...cellStyle, textAlign: 'center', whiteSpace: 'pre-wrap' }}
              data-testid={`dinner-slot-${t}`}
            >
              {(dinnerSlots[t] ?? []).join('\n')}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  )
}
