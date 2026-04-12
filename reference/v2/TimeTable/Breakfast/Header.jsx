// src/Header.js
export default function Header() {
  const times = ["7:30", "8:00", "8:30", "9:00", "9:30"];
  const cols = times.length;

  const tableStyle = {
    width: '83.3%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    backgroundColor: "#f0f0f0",

  };
  const cellStyle = {
    border: '1px solid #000',
    borderBottom: "none",
    textAlign: 'center',
    verticalAlign: 'middle',
    width: `${100 / cols}%`,
    fontWeight: "normal",
    fontSize:"11px"
  };

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          {times.map((t, i) => (
            <th key={i} style={cellStyle}>
              {t}
            </th>
          ))}
        </tr>
      </thead>
    </table>
  );
}
