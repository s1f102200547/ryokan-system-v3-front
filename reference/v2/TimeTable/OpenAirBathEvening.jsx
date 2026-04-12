// src/OpenAirBathEvening.js
import { OPEN_AIR_TIMES_EVENING } from '../constants/constants';

export default function OpenAirBathEvening({ eveningMap }) {
  const times = OPEN_AIR_TIMES_EVENING;
  const widthPct = `${100 / times.length}%`;

  const tableStyle = {
    width: '87.5%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    marginLeft: 'auto',
    marginTop: '5px',
    marginBottom: '10px',
    height: '25px',
    transform: 'translateX(-0.05%)',
  };
  const cellStyle = {
    border: '1px solid #000',
    width: widthPct,
    fontSize: '10px',
    padding: '0 4px',
    boxSizing: 'border-box',
  };
  const innerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: '100%',
  };
  const boxStyle = { fontSize: '15px', lineHeight: 1 };
  const markStyle = { fontSize: '18px', lineHeight: 1 };

  return (
    <table style={tableStyle}>
      <tbody>
        <tr>
          {times.map((t) => (
            <td key={t} style={cellStyle}>
              <div style={innerStyle}>
                <span>{t}</span>
                <span style={markStyle}>{eveningMap[t] || ''}</span>
                <span style={boxStyle}>▢</span>
              </div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
