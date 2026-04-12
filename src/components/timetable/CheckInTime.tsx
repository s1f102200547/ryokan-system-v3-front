import { VALID_ARRIVAL_TIMES } from '@/constants/timetable'

type Props = {
  checkInSlots: Record<string, string[]>
}

const headerCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  backgroundColor: '#f0f0f0',
  fontSize: '10px',
  textAlign: 'left',
  fontWeight: 'normal',
  width: `${100 / VALID_ARRIVAL_TIMES.length}%`,
}

const bodyCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  fontSize: '10px',
  verticalAlign: 'top',
  whiteSpace: 'nowrap',
  height: '100px',
  width: `${100 / VALID_ARRIVAL_TIMES.length}%`,
}

const elseCellStyle: React.CSSProperties = {
  border: '1px solid #000',
  fontSize: '10px',
  verticalAlign: 'top',
  whiteSpace: 'pre',
  width: `${(100 / VALID_ARRIVAL_TIMES.length) * 2}%`,
}

export function CheckInTime({ checkInSlots }: Props) {
  const otherItems = checkInSlots['OTHER'] ?? []
  // 前6列（15:00〜20:00）は個別セル、後2列（21:00〜22:00）は OTHER とまとめて表示
  const standardTimes = VALID_ARRIVAL_TIMES.slice(0, 6)
  const lastTwoTimes = VALID_ARRIVAL_TIMES.slice(6) // ['21:00', '22:00']

  const lastTwoItems = lastTwoTimes.flatMap((t) => checkInSlots[t] ?? [])
  const elseAll = [...lastTwoItems, ...otherItems]

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
        {/*
         * 前6列: 各時刻ごとに data-testid を持つ単一セル（最大4ゲストを縦に並べる）
         * 後2列: 21:00・22:00・OTHER をまとめて colSpan=2 で表示
         */}
        <tr>
          {standardTimes.map((t) => (
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
          <td colSpan={2} style={elseCellStyle} data-testid="checkin-slot-OTHER">
            {elseAll.map((label, i) => (
              <div key={i}>{label}</div>
            ))}
          </td>
        </tr>
      </tbody>
    </table>
  )
}
