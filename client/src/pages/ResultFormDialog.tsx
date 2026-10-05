import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Typography,
  Alert,
  Stack,
} from '@mui/material'
import { computeMatchScoring, type MatchResult, type Team } from '@bowling/shared'

export interface ResultFormValues {
  week: number
  lanes: string
  homeTeamId: string
  awayTeamId: string
  homeGames: [number, number, number]
  awayGames: [number, number, number]
  homeSeries: number
  awaySeries: number
  homePoints: number
  awayPoints: number
  homeAbsent: boolean
  awayAbsent: boolean
}

const EMPTY: ResultFormValues = {
  week: 1,
  lanes: '',
  homeTeamId: '',
  awayTeamId: '',
  homeGames: [0, 0, 0],
  awayGames: [0, 0, 0],
  homeSeries: 0,
  awaySeries: 0,
  homePoints: 0,
  awayPoints: 0,
  homeAbsent: false,
  awayAbsent: false,
}

function toForm(r: MatchResult): ResultFormValues {
  const pad = (a: number[]): [number, number, number] => [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0]
  return {
    week: r.week,
    lanes: r.lanes,
    homeTeamId: r.homeTeamId,
    awayTeamId: r.awayTeamId,
    homeGames: pad(r.homeGames),
    awayGames: pad(r.awayGames),
    homeSeries: r.homeSeries,
    awaySeries: r.awaySeries,
    homePoints: r.homePoints,
    awayPoints: r.awayPoints,
    homeAbsent: r.homeAbsent ?? false,
    awayAbsent: r.awayAbsent ?? false,
  }
}

interface Props {
  open: boolean
  teams: Team[]
  /** The result being edited, or null to add a new one. */
  initial: MatchResult | null
  onClose: () => void
  onSubmit: (values: ResultFormValues) => Promise<void>
}

export default function ResultFormDialog({ open, teams, initial, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<ResultFormValues>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // When on, points are derived from the game/series scores instead of typed.
  const [autoPoints, setAutoPoints] = useState(true)

  // Reset the form whenever the dialog opens for a different target.
  useEffect(() => {
    if (open) {
      setValues(initial ? toForm(initial) : EMPTY)
      setError(null)
      // Default auto ON for new results; OFF when editing, so stored
      // (authoritative) points aren't silently overwritten unless the admin
      // opts in by ticking the box.
      setAutoPoints(initial === null)
    }
  }, [open, initial])

  // Points derived from the current game/series scores (the authoritative
  // scoring rule: 1 per game + 1 for series, ties split 0.5 each).
  const derived = computeMatchScoring({
    week: values.week,
    lanes: values.lanes,
    homeTeamId: values.homeTeamId,
    awayTeamId: values.awayTeamId,
    homeGames: values.homeGames,
    awayGames: values.awayGames,
    homeSeries: values.homeSeries,
    awaySeries: values.awaySeries,
    homePoints: 0,
    awayPoints: 0,
  })

  // The points that will actually be submitted/shown, honoring the toggle.
  const effectivePoints = autoPoints
    ? { home: derived.homePoints, away: derived.awayPoints }
    : { home: values.homePoints, away: values.awayPoints }

  const set = <K extends keyof ResultFormValues>(key: K, v: ResultFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }))

  const setGame = (side: 'homeGames' | 'awayGames', idx: number, v: number) =>
    setValues((prev) => {
      const games = [...prev[side]] as [number, number, number]
      games[idx] = v
      return { ...prev, [side]: games }
    })

  // Parse an <input type="number"> string value into a number (empty → 0).
  const numField = (v: string): number => {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }

  async function handleSubmit() {
    setError(null)
    if (!values.homeTeamId || !values.awayTeamId) {
      setError('Both teams are required.')
      return
    }
    if (values.homeTeamId === values.awayTeamId) {
      setError('A team cannot play itself.')
      return
    }
    if (!values.lanes.trim()) {
      setError('Lanes are required (e.g. "35-36").')
      return
    }
    setBusy(true)
    try {
      await onSubmit({
        ...values,
        homePoints: effectivePoints.home,
        awayPoints: effectivePoints.away,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  const teamSelect = (
    label: string,
    key: 'homeTeamId' | 'awayTeamId',
  ) => (
    <TextField
      select
      label={label}
      value={values[key]}
      onChange={(e) => set(key, e.target.value)}
      fullWidth
      size="small"
    >
      <MenuItem value="">
        <em>Select…</em>
      </MenuItem>
      {teams.map((t) => (
        <MenuItem key={t.id} value={t.id}>
          {t.name} (#{t.number})
        </MenuItem>
      ))}
    </TextField>
  )

  const sideColumn = (
    which: 'home' | 'away',
  ) => {
    const teamKey = which === 'home' ? 'homeTeamId' : 'awayTeamId'
    const gamesKey = which === 'home' ? 'homeGames' : 'awayGames'
    const seriesKey = which === 'home' ? 'homeSeries' : 'awaySeries'
    const pointsKey = which === 'home' ? 'homePoints' : 'awayPoints'
    const absentKey = which === 'home' ? 'homeAbsent' : 'awayAbsent'
    return (
      <Stack spacing={1.5} sx={{ flex: 1, minWidth: 220 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {which === 'home' ? 'Team A' : 'Team B'}
        </Typography>
        {teamSelect(which === 'home' ? 'Team A' : 'Team B', teamKey)}
        <Box sx={{ display: 'flex', gap: 1 }}>
          {[0, 1, 2].map((i) => (
            <TextField
              key={i}
              label={`G${i + 1}`}
              type="number"
              size="small"
              value={values[gamesKey][i]}
              onChange={(e) => setGame(gamesKey, i, numField(e.target.value))}
            />
          ))}
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <TextField
            label="Series"
            type="number"
            size="small"
            value={values[seriesKey]}
            onChange={(e) => set(seriesKey, numField(e.target.value))}
            fullWidth
          />
          <TextField
            label="Points"
            type="number"
            size="small"
            slotProps={{ htmlInput: { step: 0.5 } }}
            value={autoPoints ? (which === 'home' ? effectivePoints.home : effectivePoints.away) : values[pointsKey]}
            onChange={(e) => set(pointsKey, numField(e.target.value))}
            disabled={autoPoints}
            helperText={autoPoints ? 'Auto' : undefined}
            fullWidth
          />
        </Box>
        <FormControlLabel
          control={
            <Checkbox
              checked={values[absentKey]}
              onChange={(e) => set(absentKey, e.target.checked)}
            />
          }
          label="Absent (vacant scores)"
        />
      </Stack>
    )
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{initial ? 'Edit match result' : 'Add match result'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField
              label="Week"
              type="number"
              size="small"
              value={values.week}
              onChange={(e) => set('week', numField(e.target.value))}
            />
            <TextField
              label="Lanes"
              size="small"
              placeholder="35-36"
              value={values.lanes}
              onChange={(e) => set('lanes', e.target.value)}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {sideColumn('home')}
            {sideColumn('away')}
          </Box>
          <FormControlLabel
            control={
              <Checkbox
                checked={autoPoints}
                onChange={(e) => setAutoPoints(e.target.checked)}
              />
            }
            label="Auto-calculate points from scores"
          />
          <Typography variant="caption" color="text.secondary">
            Points: 1 per game won + 1 for the higher series; ties split 0.5 each
            (4 total). {autoPoints
              ? 'Points are calculated from the game and series scores above.'
              : 'Enter the recorded points manually.'}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit" disabled={busy}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
