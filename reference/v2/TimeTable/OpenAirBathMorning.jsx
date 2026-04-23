// src/OpenAirBathMorning.js
import { OPEN_AIR_TIMES_MORNING } from '../constants/constants';

export default function OpenAirBathMorning({ morningMap }) {
  const times = OPEN_AIR_TIMES_MORNING;
  const widthPct = `${100 / times.length}%`;

  const tableStyle = {
    width: '83.3%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
    marginTop: '5px',
  };
  const cellStyle = {
    border: '1px solid #000',
    borderBottom: 'none',
    padding: '6px',
    verticalAlign: 'middle',
    width: widthPct,
    boxSizing: 'border-box',
  };
  const innerStyle = {
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
  };
  const markStyle = {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '18px',
    lineHeight: 1,
  };
  const timeStyle = {
    
    fontSize: '11px',
  };

  return (
    <table style={tableStyle}>
      <tbody>
        <tr>
          {times.map((t) => (
            <td key={t} style={cellStyle}>
              <div style={innerStyle}>
                <span style={markStyle}>{morningMap[t] || ''}</span>
                <span style={timeStyle}>{t}</span>
              </div>
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
