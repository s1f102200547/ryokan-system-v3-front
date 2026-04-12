export default function NumberOfBreakfast() {
  const tableStyle = {
    width:           '100%',
    borderCollapse:  'collapse',
    tableLayout:     'fixed',
    height: "99px"
  };
  const cellStyle = {
    border:         '1px solid #000',
    textAlign:      'center',
    verticalAlign:  'middle',
    fontSize: "11px"
  };

  return (
    <table style={tableStyle}>
      <tbody>
        <tr>
          <td style={cellStyle}>明日の朝食人数：　　人</td>
        </tr>
        <tr>
          <td style={cellStyle}>
            明後日の朝食人数：　　人<br /><br />
            鮭：　　人　　鯖：　　人　　つくね：　　人<br />
            　　:　　　 人　　　　:　　　人
          </td>
        </tr>
      </tbody>
    </table>
  );
}
