type Props = {
  breakfastSlots: Record<string, string[]>
}

// 朝食時刻キーの列順（ヘッダーの 7:30〜9:30 に対応）
const A_TIMES = ['7:30a', '8:00a', '8:30a', '9:00a', '9:30a'] as const
const B_TIMES = ['7:30b', '8:00b', '8:30b', '9:00b', '9:30b'] as const

// 場所ラベル
const LOCATION_LABEL: Record<string, string> = {
  '7:30a': 'ラウンジ', '8:00a': 'ラウンジ', '8:30a': '53号室', '9:00a': 'ラウンジ', '9:30a': '53号室',
  '7:30b': 'ラウンジ', '8:00b': 'ラウンジ', '8:30b': '54号室', '9:00b': 'ラウンジ', '9:30b': '54号室',
}

const cellStyle: React.CSSProperties = {
  border: '1px solid #000',
  borderLeft: 'none',
  borderBottom: 'none',
  padding: '4px',
  textAlign: 'center',
  verticalAlign: 'middle',
  fontSize: '10px',
}

function BreakfastCell({ timeKey, marks }: { timeKey: string; marks: string[] }) {
  return (
    <div
      data-testid={`breakfast-slot-${timeKey}`}
      style={{
        border: '1px solid #000',
        borderLeft: 'none',
        borderBottom: 'none',
        padding: '4px',
        fontSize: '10px',
        minHeight: '145px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: '4px',
      }}
    >
      <div style={{ fontSize: '9px' }}>
        {LOCATION_LABEL[timeKey]}
      </div>
      <div style={{ fontSize: '9px', width: '100%', display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', minWidth: '48px', flexShrink: 0 }}>
          <span>Room:</span>
          {marks.map((m, i) => (
            <span key={i} style={{ fontSize: '18px', lineHeight: 1 }}>{m}</span>
          ))}
        </span>
        <span>menu:</span>
        <span style={{ marginLeft: 'auto' }}>×&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>
      </div>
    </div>
  )
}

export function Breakfast({ breakfastSlots }: Props) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gridTemplateRows: 'auto auto',
        width: '83.2%',
        borderLeft: '1px solid #000',
        borderBottom: '1px solid #000',
      }}
    >
      {A_TIMES.map((key) => (
        <BreakfastCell key={key} timeKey={key} marks={breakfastSlots[key] ?? []} />
      ))}
      {B_TIMES.map((key) => (
        <BreakfastCell key={key} timeKey={key} marks={breakfastSlots[key] ?? []} />
      ))}
    </div>
  )
}
