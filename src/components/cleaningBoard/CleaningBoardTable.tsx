import type { CleaningBoardRow } from '@/types/cleaningBoard'

type Props = {
  rows: CleaningBoardRow[]
}

// 37単位グリッドでカラム幅を計算（v2 PrintConfig.js 準拠）
const TOTAL_UNITS = 37
const unit = (pct: number) => `${((100 / TOTAL_UNITS) * pct).toFixed(4)}%`

const cellStyle: React.CSSProperties = {
  border: '0.5px solid #000',
  padding: '3px 1px',
  textAlign: 'center',
  verticalAlign: 'middle',
}

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  whiteSpace: 'normal',
  lineHeight: 1.2,
  padding: '10px 4px',
}

// C/I 列の表示文字列を生成
function formatCiCell(row: CleaningBoardRow): string {
  if (!row.checkInReservation) return ''
  const { adult_count, child_count } = row.checkInReservation
  const childStr = child_count > 0 ? `(${child_count})` : ''
  const base = `${adult_count}${childStr}`
  return row.isFutureCheckIn ? `(${base})` : base
}

export function CleaningBoardTable({ rows }: Props) {
  return (
    <>
      <style>{`
        @page { size: A4 landscape; margin: 10mm }
        @media print {
          body * { visibility: hidden }
          .print-area, .print-area * { visibility: visible }
          .print-area { position: absolute; top: 0; left: 0; width: 100% }
          .no-print { display: none !important }
        }
      `}</style>
      <table
        style={{
          width: '100%',
          tableLayout: 'fixed',
          borderCollapse: 'collapse',
          borderSpacing: 0,
          fontFamily: 'sans-serif',
          fontSize: '8pt',
          color: '#000',
        }}
      >
        <thead>
          <tr>
            <th style={{ ...headerCellStyle, width: unit(2) }}>Rooms</th>
            <th style={{ ...headerCellStyle, width: unit(7) }}>伝達事項</th>
            <th style={{ ...headerCellStyle, width: unit(4) }}>浴衣サイズ</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>C/I</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>連泊</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>清掃</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>布団</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>タオル2点</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>バスマット</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>シャンプー</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>歯ブラシ等</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>水コップ</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>ティッシュ</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>ゴミ箱</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>掛け花</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>トイレペーパー</th>
            <th style={{ ...headerCellStyle, width: unit(1) }}>ライト(連泊)</th>
            <th style={{ ...headerCellStyle, width: unit(10) }}>清掃担当メモ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.room}>
              <td style={{ ...cellStyle, width: unit(2) }}>{row.room}</td>
              <td style={{ ...cellStyle, width: unit(7) }}></td>
              <td style={{ ...cellStyle, width: unit(4) }}></td>
              <td
                style={{ ...cellStyle, width: unit(1) }}
                data-testid={`ci-cell-${row.room}`}
              >
                {formatCiCell(row)}
              </td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(1) }}></td>
              <td style={{ ...cellStyle, width: unit(10) }}></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
