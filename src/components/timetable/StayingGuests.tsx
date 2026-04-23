type Props = {
  stayingGuestLabels: string[]
}

export function StayingGuests({ stayingGuestLabels }: Props) {
  return (
    <div
      data-testid="staying-guests"
      style={{ fontSize: '12px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}
    >
      {stayingGuestLabels.map((label, i) => (
        <span key={i}>{label}</span>
      ))}
    </div>
  )
}
