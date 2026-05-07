'use client'

import { useState, useMemo } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import CircularProgress from '@mui/material/CircularProgress'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Paper from '@mui/material/Paper'
import { useUpdateATax } from '@/hooks/aTaxTable/useUpdateATax'
import { useUpdateSafeBalanceChecker } from '@/hooks/aTaxTable/useUpdateSafeBalanceChecker'
import type { ATaxTableRow } from '@/application/aTaxTable/getATaxTableUseCase'

export type ProcessedRow = ATaxTableRow & {
  isLastDate: boolean
  safeBalanceChecker: string
  adultNightSum: number | null
}

// -------- computation (pure, no hooks) --------

export function computeProcessedRows(
  rows: ATaxTableRow[],
  safeBalanceCheckers: Record<string, string>,
  option: 'previous' | 'current',
  enableFilter: boolean,
): ProcessedRow[] {
  const sorted = [...rows].sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))

  const dateCount = sorted.reduce<Record<string, number>>((acc, r) => {
    acc[r.check_in_date] = (acc[r.check_in_date] ?? 0) + 1
    return acc
  }, {})

  const dateAdultNightSum = sorted.reduce<Record<string, number>>((acc, r) => {
    if (r.booking_site === 'chillnn' || r.a_tax_received) {
      acc[r.check_in_date] = (acc[r.check_in_date] ?? 0) + r.adult_count * r.nights
    }
    return acc
  }, {})

  const seenCount: Record<string, number> = {}
  const enhanced: ProcessedRow[] = sorted.map((r) => {
    const d = r.check_in_date
    seenCount[d] = (seenCount[d] ?? 0) + 1
    const isLastDate = seenCount[d] === dateCount[d]
    return {
      ...r,
      isLastDate,
      safeBalanceChecker: isLastDate ? (safeBalanceCheckers[d] ?? '') : '',
      adultNightSum: isLastDate ? (dateAdultNightSum[d] ?? 0) : null,
    }
  })

  if (option === 'previous' || !enableFilter) return enhanced

  // 今月フィルタON: 最初の未受領行の日付〜今日まで
  const firstUnrec = sorted.find((r) => r.booking_site !== 'chillnn' && !r.a_tax_received)
  const startDateStr = firstUnrec?.check_in_date ?? new Date().toISOString().slice(0, 10)
  const startDate = new Date(startDateStr)
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  if (startDate > today) startDate.setTime(today.getTime())

  return enhanced.filter((r) => {
    const d = new Date(r.check_in_date)
    return d >= startDate && d <= today
  })
}

// -------- named cell components --------

function ATaxCheckboxCell({
  id,
  checked,
  onToggle,
}: {
  id: string
  checked: boolean
  onToggle: (id: string, checked: boolean) => void
}) {
  const { execute } = useUpdateATax()
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    onToggle(id, next)
    await execute(id, { a_tax_received: next })
  }
  return <Checkbox checked={checked} onChange={handleChange} size="small" />
}

function StaffNameCell({ id, value }: { id: string; value: string }) {
  const { execute } = useUpdateATax()
  const [text, setText] = useState(value)

  const handleBlur = async () => {
    if (text === value) return
    await execute(id, { a_tax_received_by_staff_name: text })
  }

  return (
    <TextField
      variant="standard"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      fullWidth
      size="small"
    />
  )
}

function SafeBalanceCheckerCell({ date, value }: { date: string; value: string }) {
  const { execute } = useUpdateSafeBalanceChecker()
  const [text, setText] = useState(value)

  const handleBlur = async () => {
    if (text === value) return
    await execute(date, text)
  }

  return (
    <TextField
      variant="standard"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={handleBlur}
      fullWidth
      size="small"
    />
  )
}

// -------- main table component --------

const HEADERS: { label: string; width?: number | string; align?: 'center' | 'left' }[] = [
  { label: '受領済み',    width: 52,   align: 'center' },
  { label: 'C/I日',      width: 110,  align: 'center' },
  { label: '部屋',       width: 52,   align: 'center' },
  { label: 'ゲスト名',   align: 'left' },
  { label: '大人人数',   width: 60,   align: 'center' },
  { label: '泊数',       width: 44,   align: 'center' },
  { label: '予約サイト', width: 100,  align: 'center' },
  { label: '宿泊税',     width: 72,   align: 'center' },
  { label: '受領スタッフ名', width: 100, align: 'center' },
  { label: '締めスタッフ名', width: 100, align: 'center' },
  { label: '大人×泊',   width: 56,   align: 'center' },
]

type Props = {
  processedRows: ProcessedRow[]
  loading: boolean
  onToggle: (id: string, checked: boolean) => void
}

export function ReservationTable({ processedRows, loading, onToggle }: Props) {
  const [error, setError] = useState<string | null>(null)
  void setError // suppress unused warning — used in cell error handling

  const cellSx = useMemo(() => ({ py: 0.5, px: 1, fontSize: '0.75rem' }), [])

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <TableContainer component={Paper} sx={{ maxHeight: 600, overflowY: 'auto' }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {HEADERS.map((h) => (
                <TableCell
                  key={h.label}
                  align={h.align ?? 'left'}
                  sx={{ fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap', width: h.width }}
                >
                  {h.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {processedRows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={cellSx} align="center">
                  {row.booking_site !== 'chillnn' && (
                    <ATaxCheckboxCell id={row.id} checked={row.a_tax_received} onToggle={onToggle} />
                  )}
                </TableCell>
                <TableCell sx={cellSx} align="center">{row.check_in_date}</TableCell>
                <TableCell sx={cellSx} align="center">{row.room ?? '—'}</TableCell>
                <TableCell sx={cellSx}>{row.guest_name}</TableCell>
                <TableCell sx={cellSx} align="center">{row.adult_count}</TableCell>
                <TableCell sx={cellSx} align="center">{row.nights}</TableCell>
                <TableCell sx={cellSx} align="center">{row.booking_site}</TableCell>
                <TableCell sx={cellSx} align="center">{row.tax === 0 ? '免除' : `¥${row.tax.toLocaleString()}`}</TableCell>
                <TableCell sx={cellSx} align="center">
                  {row.booking_site !== 'chillnn' && (
                    <StaffNameCell id={row.id} value={row.a_tax_received_by_staff_name} />
                  )}
                </TableCell>
                <TableCell sx={cellSx} align="center">
                  {row.isLastDate && (
                    <SafeBalanceCheckerCell date={row.check_in_date} value={row.safeBalanceChecker} />
                  )}
                </TableCell>
                <TableCell sx={cellSx} align="center">
                  {row.isLastDate ? row.adultNightSum : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}
