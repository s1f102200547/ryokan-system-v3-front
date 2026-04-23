// src/GuestInfo.js
import React from 'react';

export default function GuestInfo({ stayStatus }) {
  // 客室番号リスト
  const rooms = ["21", "22", "31", "32", "42", "43", "61", ""];

  // テーブル全体のスタイル
  const tableStyle = {
    width: "95%",
    borderCollapse: "collapse",
    tableLayout: "fixed",
    height: "100%",
    marginLeft: "5%"
  };

  // 共通セルスタイル
  const cellStyle = {
    border: "1px solid #000",
    padding: "8px",
    verticalAlign: "middle",
  };

  // １列目（客室番号）のスタイル
  const roomCellStyle = {
    ...cellStyle,
    width: "40px",
    textAlign: "center",
  };

  // ２列目（ステータス）のスタイル
  const infoCellStyle = {
    ...cellStyle,
    textAlign: "center",
    // 固定の高さを指定
    height: "51px",//60*7=420/8
    // td 自体で overflow を隠しておく
    overflow: "hidden",
    padding: "4px",   // 少し内側に寄せたい場合
  };

  // セル内のラッパー：マルチライン・クランプ
  const infoWrapperStyle = {
    display: "-webkit-box",
    WebkitBoxOrient: "vertical",
    // 表示したい最大行数。height ÷ line-height で調整してください
    WebkitLineClamp: 3,
    overflow: "hidden",
    whiteSpace: "normal",
    lineHeight: "1.2em",
    fontSize: "10px",
  };

  return (
    <table style={tableStyle}>
      <tbody>
        {rooms.map(room => (
          <tr key={room}>
            <td style={roomCellStyle}>{room}</td>
            <td style={infoCellStyle}>
              <div style={infoWrapperStyle}>
                {stayStatus[room] || ""}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
