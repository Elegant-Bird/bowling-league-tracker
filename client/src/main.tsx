import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import '@fontsource/roboto/300.css'
import '@fontsource/roboto/400.css'
import '@fontsource/roboto/500.css'
import '@fontsource/roboto/700.css'
import App from './App'
import { AuthProvider } from './auth/AuthContext'
import { LeagueProvider } from './data/LeagueContext'
import theme from './theme'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>
          <LeagueProvider>
            <App />
          </LeagueProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
