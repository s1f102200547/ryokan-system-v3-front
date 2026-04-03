import type { CleaningBoardRow } from '@/types/cleaningBoard'

type Props = {
  rows: CleaningBoardRow[]
}

export function CleaningBoardNotes({ rows }: Props) {
  const notes = rows.flatMap((row) => row.autoNotes)

  return (
    <div style={{ marginTop: 12, fontSize: '8pt' }}>
      <div style={{ marginBottom: 4 }}>備考／引継ぎ →</div>
      <div
        data-testid="auto-notes-box"
        style={{
          border: '0.5px solid #000',
          height: 90,
          width: '100%',
          padding: '4px 6px',
          boxSizing: 'border-box',
          whiteSpace: 'pre-line',
        }}
      >
        {notes.join('\n')}
      </div>
    </div>
  )
}
