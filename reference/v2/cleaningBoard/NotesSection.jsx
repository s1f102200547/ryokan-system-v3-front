import React from 'react';
import { S } from '../utils/printConfig';
import { parseDate } from '../utils/dateUtils';

export default function NotesSection({
  targetDate,
  specifiedReservations = [],
  pastReservations = [],
  futureReservations = []
}) {
  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  const notes = [];

  // 空室情報
  futureReservations.forEach(res => {
    notes.push({ room: res.room, text: '空室' });
  });

  // レイトアウト情報
  [...specifiedReservations, ...pastReservations].forEach(res => {
    if (res.late_out) {
      const coDate = parseDate(res.check_out_date);
      if (coDate.toDateString() === nextDay.toDateString()) {
        notes.push({ room: res.room, text: 'レイトアウト11:00' });
      }
    }
  });

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 4 }}>備考／引継ぎ →</div>
      <div style={{
          ...S.notesBox,
          display: 'flex', // 横並びに
          flexWrap: 'wrap',
          gap: '8px',
          alignItems: 'center'
        }}>
        {notes.length > 0 && (
          notes.map((n, i) => (
            <div
              key={`${n.room}-${n.text}-${i}`}
              style={{ fontSize: '1.1em', lineHeight: 1.4, marginBottom: 2 }}
            >
              {`${n.room}: ${n.text}`}
            </div>
          ))
        )}
      </div>
    </div>
  );
}