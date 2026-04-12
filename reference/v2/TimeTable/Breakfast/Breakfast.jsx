// src/Breakfast.js
import { ALLOWED_TIMES } from "../../constants/breakfastLabels"
import { BREAKFAST_LABELS_a } from "../../constants/breakfastLabels"
import { BREAKFAST_LABELS_b } from "../../constants/breakfastLabels"

export default function Breakfast({ breakfastMap }) {
  // 列の比率 (ラウンジ:空 = 5:1)
  const ratios = [5, 1]
  const totalRatio = ratios.reduce((sum, r) => sum + r, 0)

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    tableLayout: 'fixed',
  }
  const cellStyle = {
    border: '1px solid #000',
    borderLeft: 'none',
    borderBottom: 'none',
    padding: '6px',
    textAlign: 'center',
    verticalAlign: 'middle',
    fontSize: '11px',
  }
  const fullCell = {
    ...cellStyle,
    width: '100%',
  }

  // 1) "a" の時刻キーだけ抽出
  const aTimes = ALLOWED_TIMES.filter((t) => t.endsWith('a'))
  // 2) "b" の時刻キーだけ抽出
  const bTimes = ALLOWED_TIMES.filter((t) => t.endsWith('b'))

  const renderTable = (timeKey, labelMap) => {
    const display = labelMap[timeKey] || ""
    // breakfastMap は prop で渡ってくる { "7:30a": "㉑", ... } という想定
    const roomValue = breakfastMap[timeKey]
    // details を動的に作成
    const details = roomValue
      ? [`Room: ${roomValue}`, '　', '　', '　']
      : ['　', '　', '　', '　']

    return (
      <table key={timeKey} style={tableStyle}>
        <tbody>
          <tr>
            {ratios.map((r, i) => (
              <td
                key={i}
                style={{
                  ...cellStyle,
                  width: `${(r / totalRatio) * 100}%`,
                }}
              >
                {i === 0 ? display : "　"}
              </td>
            ))}
          </tr>
          {details.map((text, i) => (
            <tr key={i}>
              <td colSpan={2} style={fullCell}>
                {text}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        width: '83.2%',
        borderLeft: '1px solid #000',
        borderBottom: '1px solid #000',
        gap: 0,
      }}
    >
      {/** 上段: aTimes **/}
      {aTimes.map((timeKey) => renderTable(timeKey, BREAKFAST_LABELS_a))}

      {/** 下段: bTimes **/}
      {bTimes.map((timeKey) => renderTable(timeKey, BREAKFAST_LABELS_b))}
    </div>
  )
}
