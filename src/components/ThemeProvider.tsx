'use client'

import { ThemeProvider as MuiThemeProvider, createTheme, CssBaseline } from '@mui/material'

const theme = createTheme()

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  )
}
