// src/Dinner.js

export default function Dinner({ dinnerMap }) {
  // ヘッダーに並べる時間（7 列）
  const times = ["未定", "17:30", "18:00", "18:30", "19:00", "19:30", "20:00"];

  // テーブル全体のスタイル
  const tableStyle = {
    width: "87.5%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    height: "100px",
    marginLeft: "12.4%",
  };
  // th / td 共通スタイル
  const cellStyle = {
    border: "1px solid #000",
    fontWeight: "normal",
    fontSize: "9px",
    verticalAlign: "middle",
    width: `${100 / times.length}%`,
  };

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          {times.map((t, i) => (
            <th key={i} style={{ ...cellStyle, textAlign: 'center' }}>
              {t}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {times.map((t, i) => {
            const guests = dinnerMap[t] || [];
            return (
              <td
                key={i}
                style={{ ...cellStyle, textAlign: 'center', whiteSpace: 'pre-wrap' }}
              >
                {guests.join('\n')}
              </td>
            );
          })}
        </tr>
      </tbody>
    </table>
  );
}
