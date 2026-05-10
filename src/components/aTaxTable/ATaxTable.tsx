'use client'

import { useState, useCallback, useMemo } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import { useATaxTable } from '@/hooks/aTaxTable/useATaxTable'
import { MonthSelector } from './MonthSelector'
import { BalanceDisplay } from './BalanceDisplay'
import { ReservationTable, computeProcessedRows } from './ReservationTable'
import type { ATaxTableRow } from '@/application/aTaxTable/getATaxTableUseCase'

type MonthOption = 'previous' | 'current'

function useMonthlyTarget(option: MonthOption) {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  return {
    targetYear: option === 'current' ? year : prevYear,
    targetMonth: option === 'current' ? month : prevMonth,
    previousLabel: `${prevMonth}月`,
    currentLabel: `${month}月`,
  }
}

function buildCSVContent(processedRows: ReturnType<typeof computeProcessedRows>): string {
  if (processedRows.length === 0) return ''
  const BOM = '\uFEFF'
  const headers = [
    '受領済み', 'C/I日', '部屋', 'ゲスト名', '大人人数', '泊数',
    '予約サイト', '宿泊税', '受領スタッフ名', '締めスタッフ名', '大人人数×泊数',
  ]
  type Field = keyof ReturnType<typeof computeProcessedRows>[number]
  const fields: Field[] = [
    'a_tax_received', 'check_in_date', 'room', 'guest_name', 'adult_count', 'nights',
    'booking_site', 'tax', 'a_tax_received_by_staff_name', 'safeBalanceChecker', 'adultNightSum',
  ]
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const body = processedRows.map((r) => fields.map((f) => esc(r[f])).join(',')).join('\n')
  const total = processedRows.reduce((s, r) => s + (r.adultNightSum ?? 0), 0)
  const totalCells = fields.map((_, i) => (i === fields.length - 2 ? '"合計"' : i === fields.length - 1 ? `"${total}"` : '""'))
  return BOM + headers.join(',') + '\n' + body + '\n' + totalCells.join(',')
}

function triggerCSVDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

// -------- inner body (key= causes remount when month changes) --------

type BodyProps = {
  rows: ATaxTableRow[]
  safeBalanceCheckers: Record<string, string>
  option: MonthOption
  targetYear: number
  targetMonth: number
}

function ATaxTableBody({
  rows,
  safeBalanceCheckers,
  option,
  targetYear,
  targetMonth,
}: BodyProps) {
  // Track checkbox overrides for optimistic UI; resets automatically via key= remount
  const [localATaxReceived, setLocalATaxReceived] = useState<Record<string, boolean>>({})

  const activeRows = useMemo(
    () => rows.filter((r) => r.cancel !== 1),
    [rows],
  )

  const displayRows = useMemo(
    () => activeRows.map((r) => ({ ...r, a_tax_received: localATaxReceived[r.id] ?? r.a_tax_received })),
    [activeRows, localATaxReceived],
  )

  const processedRows = useMemo(
    () => computeProcessedRows(displayRows, safeBalanceCheckers, option, false),
    [displayRows, safeBalanceCheckers, option],
  )

  const handleToggle = useCallback((id: string, checked: boolean) => {
    setLocalATaxReceived((prev) => ({ ...prev, [id]: checked }))
  }, [])

  const totalReceived = useMemo(
    () => displayRows.reduce((sum, r) => sum + (r.a_tax_received ? r.tax : 0), 0),
    [displayRows],
  )
  const monthlyAdultNightSum = useMemo(
    () => processedRows.reduce((sum, r) => sum + (r.adultNightSum ?? 0), 0),
    [processedRows],
  )

  const handleDownloadCSV = () => {
    const csv = buildCSVContent(processedRows)
    triggerCSVDownload(csv, `${targetYear}-${String(targetMonth).padStart(2, '0')}-a-tax.csv`)
  }

  return (
    <>
      {option === 'previous' && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Button variant="outlined" onClick={handleDownloadCSV}>
            CSVダウンロード（先月分）
          </Button>
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
        <BalanceDisplay totalReceived={totalReceived} monthlyAdultNightSum={monthlyAdultNightSum} />
      </Box>

      <ReservationTable
        processedRows={processedRows}
        loading={false}
        onToggle={handleToggle}
      />
    </>
  )
}

// -------- outer shell --------

export function ATaxTable() {
  const [selectedOption, setSelectedOption] = useState<MonthOption>('current')
  const { targetYear, targetMonth, previousLabel, currentLabel } = useMonthlyTarget(selectedOption)
  const { data, isLoading, error } = useATaxTable(targetYear, targetMonth)

  const handleOptionChange = (opt: MonthOption) => {
    setSelectedOption(opt)
  }

  return (
    <Box>
      <MonthSelector
        selectedOption={selectedOption}
        previousLabel={previousLabel}
        currentLabel={currentLabel}
        onChange={handleOptionChange}
      />

      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      )}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {!isLoading && !error && (
        <ATaxTableBody
          key={`${targetYear}-${targetMonth}`}
          rows={data?.rows ?? []}
          safeBalanceCheckers={data?.safeBalanceCheckers ?? {}}
          option={selectedOption}
          targetYear={targetYear}
          targetMonth={targetMonth}
        />
      )}
    </Box>
  )
}
