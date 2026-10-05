import { createTheme } from '@mui/material/styles'

// Dark, bowling-alley-inspired theme: deep lane-wood background with a
// warm amber accent (pin highlight) and a cool blue secondary.
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#f5a623', // amber "pin" accent
      contrastText: '#1a1200',
    },
    secondary: {
      main: '#4a9eff',
    },
    background: {
      default: '#0f1419',
      paper: '#1a2129',
    },
    success: { main: '#3fb950' },
    error: { main: '#f85149' },
    text: {
      primary: '#e6edf3',
      secondary: '#9aa7b4',
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily:
      '"Roboto", system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
    h1: { fontWeight: 800, fontSize: '2.2rem' },
    h2: { fontWeight: 700, fontSize: '1.6rem' },
    h3: { fontWeight: 700, fontSize: '1.25rem' },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          border: '1px solid rgba(255,255,255,0.06)',
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: '#9aa7b4',
          fontWeight: 700,
          fontSize: '0.75rem',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, minHeight: 56 },
      },
    },
  },
})

export default theme
