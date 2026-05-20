const containerStyle: React.CSSProperties = {
  fontSize: '11px',
  lineHeight: 1.35,
}

export function NumberOfBreakfast() {
  return (
    <div style={containerStyle}>
      <div>本日の朝食人数：　　人</div>
      <div>翌日の朝食人数：　　人（鮭：　　人　鯖：　　人　つくね：　　人）</div>
    </div>
  )
}
