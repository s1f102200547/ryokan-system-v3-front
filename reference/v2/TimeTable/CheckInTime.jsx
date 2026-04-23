// src/CheckInTime.js
import { VALID_ARRIVAL_TIMES } from "../constants/constants";

export default function CheckInTime({ arrivalDict }) {
  const tableStyle = {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
  };

  const commonCell = {
    border: "1px solid #000",
  };

  const headerCellStyle = {
    ...commonCell,
    backgroundColor: "#f0f0f0",
    width: "12.5%",
    fontSize: "10px",    
    textAlign: "left",
    fontWeight: "normal",
  };

  const bodyCellStyle = {
    ...commonCell,
    height: "25px",
    maxHeight: "25px",
    overflow: "visible",
    whiteSpace: "nowrap",
    fontSize: "10px",
    width: "12.5%",
  };

  // else 用セルにだけ white-space: pre を設定
  const elseCellStyle = {
    ...commonCell,
    fontSize: "10px",
    overflow: "visible",
    whiteSpace: "pre",  // ← ここを追加
  };

  const chunkElseItems = (items) => {
    const chunks = [];
    for (let i = 0; i < items.length; i += 2) {
      chunks.push(items.slice(i, i + 2));
    }
    return chunks;
  };

  const elseItems = arrivalDict["else"] || [];
  const elseRows = chunkElseItems(elseItems);

  return (
    <table style={tableStyle}>
      <thead>
        <tr>
          {VALID_ARRIVAL_TIMES.map((t, i) => (
            <th style={headerCellStyle} key={i}>{t}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {/* 1〜2行目 */}
        {Array.from({ length: 2 }).map((_, rowIdx) => (
          <tr key={rowIdx}>
            {VALID_ARRIVAL_TIMES.map((t, i) => (
              <td style={bodyCellStyle} key={i}>
                {(arrivalDict[t] || [])[rowIdx] || ""}
              </td>
            ))}
          </tr>
        ))}

        {/* 3行目：elseはここでまとめて表示 */}
        <tr>
          {VALID_ARRIVAL_TIMES.slice(0, 6).map((t, i) => (
            <td style={bodyCellStyle} key={i}>
              {(arrivalDict[t] || [])[2] || ""}
            </td>
          ))}
          <td style={elseCellStyle} colSpan={2} rowSpan={2}>
            {elseRows.map((rowItems, idx) => (
              <div key={idx} style={{ marginBottom: "2px" }}>
                {rowItems.join("\t")}
              </div>
            ))}
          </td>
        </tr>

        {/* 4行目 */}
        <tr>
          {VALID_ARRIVAL_TIMES.slice(0, 6).map((t, i) => (
            <td style={bodyCellStyle} key={i}>
              {(arrivalDict[t] || [])[3] || ""}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
