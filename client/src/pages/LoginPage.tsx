import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  Box,
  Stack,
} from '@mui/material'
import LoginIcon from '@mui/icons-material/Login'
import LogoutIcon from '@mui/icons-material/Logout'
import { useAuth } from '../auth/AuthContext'
import PageHeader from '../components/PageHeader'

export default function LoginPage() {
  const { user, signIn, signOut } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(username, password)
      navigate('/standings')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.')
    } finally {
      setBusy(false)
    }
  }

  if (user) {
    return (
      <>
        <PageHeader title="Admin" subtitle={`You are signed in as ${user.username}.`} />
        <Card sx={{ maxWidth: 420 }}>
          <CardContent>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              Editing league data from the UI isn't wired up yet. Once a backend
              exists, admin controls will appear here.
            </Typography>
            <Button variant="outlined" startIcon={<LogoutIcon />} onClick={signOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Admin login"
        subtitle="Login is optional — anyone can browse the site. Sign in only to make updates."
      />

      <Card sx={{ maxWidth: 420 }}>
        <CardContent>
          <Box component="form" onSubmit={handleSubmit}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                fullWidth
              />
              <Button
                type="submit"
                variant="contained"
                startIcon={<LoginIcon />}
                disabled={busy}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </Button>
              <Typography variant="caption" color="text.secondary">
                Placeholder auth: any non-empty username and password works for now.
              </Typography>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </>
  )
}
