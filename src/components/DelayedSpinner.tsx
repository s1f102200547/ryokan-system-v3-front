'use client'

import { useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

// 待ちが DELAYED_SPINNER_MS を超えたときだけ出すスピナー。どの画面の読み込み中にも使える。
// 待ちはほとんど 1 秒未満で、すぐ出すとスピナーが少し回っただけで消えてちらつく。短い待ちでは何も出さない。
// 出すかどうかは、この部品が画面に出てからの時間で決める（読み込み中の間だけ描画すること）
export const DELAYED_SPINNER_MS = 500

type Props = {
  label: string
  delayMs?: number
}

export function DelayedSpinner({ label, delayMs = DELAYED_SPINNER_MS }: Props) {
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs)
    return () => clearTimeout(timer)
  }, [delayMs])

  if (!shown) return null
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', '@media print': { display: 'none' } }}>
      <CircularProgress aria-label={label} />
    </Box>
  )
}
