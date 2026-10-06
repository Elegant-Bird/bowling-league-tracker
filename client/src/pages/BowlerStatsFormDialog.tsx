import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Alert,
  Stack,
  Typography,
} from '@mui/material'
import type { BowlerWeekStats } from '@bowling/shared'

export interface BowlerStatsFormValues {
  bowlerId: string
  week: number
  avg: number
  entAvg: number
  hdcp: number
  gamesPlayed: number
  pins: number
  highGame: number
  highSeries: number
}

function emptyFor(bowlerId: string): BowlerStatsFormValues {
  return {
    bowlerId,
    week: 1,
    avg: 0,
    entAvg: 0,
    hdcp: 0,
    gamesPlayed: 0,
    pins: 0,
    highGame: 0,
    highSeries: 0,
  }
}

const NUMBER_FIELDS: { key: keyof BowlerStatsFormValues; label: string }[] = [
  { key: 'avg', label: 'Avg' },
  { key: 'entAvg', label: 'Ent Avg' },
  { key: 'hdcp', label: 'Hdcp' },
  { key: 'gamesPlayed', label: 'Games' },
  { key: 'pins', label: 'Pins' },
  { key: 'highGame', label: 'High Game' },
  { key: 'highSeries', label: 'High Series' },
]

interface Props {
  open: boolean
  /** Which bowler these stats belong to (and a display name). */
  bowlerId: string
  bowlerName: string
  /** The stats row being edited, or null to add a new week. */
  initial: BowlerWeekStats | null
  onClose: () => void
  onSubmit: (values: BowlerStatsFormValues) => Promise<void>
}

export default function BowlerStatsFormDialog({
  open,
  bowlerId,
  bowlerName,
  initial,
  onClose,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<BowlerStatsFormValues>(emptyFor(bowlerId))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setValues(initial ? { ...initial } : emptyFor(bowlerId))
      setError(null)
    }
  }, [open, initial, bowlerId])

  const set = <K extends keyof BowlerStatsFormValues>(
    key: K,
    v: BowlerStatsFormValues[K],
  ) => setValues((prev) => ({ ...prev, [key]: v }))

  const numField = (v: string): number => {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }

  async function handleSubmit() {
    setError(null)
    if (!Number.isInteger(values.week) || values.week <= 0) {
      setError('Week must be a positive whole number.')
      return
    }
    if (NUMBER_FIELDS.some((f) => (values[f.key] as number) < 0)) {
      setError('Numeric values cannot be negative.')
      return
    }
    setBusy(true)
    try {
      await onSubmit(values)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {initial ? 'Edit weekly stats' : 'Add weekly stats'}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2" color="text.secondary">
            {bowlerName}
          </Typography>
          <TextField
            label="Week"
            type="number"
            size="small"
            value={values.week}
            onChange={(e) => set('week', numField(e.target.value))}
            disabled={initial !== null}
            helperText={initial !== null ? 'Week cannot be changed' : undefined}
            sx={{ maxWidth: 140 }}
          />
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            {NUMBER_FIELDS.map((f) => (
              <TextField
                key={f.key}
                label={f.label}
                type="number"
                size="small"
                value={values[f.key] as number}
                onChange={(e) => set(f.key, numField(e.target.value) as never)}
                sx={{ width: 110 }}
              />
            ))}
          </Box>
          <Alert severity="info" variant="outlined">
            Enter the cumulative numbers exactly as printed on that week's
            official sheet.
          </Alert>
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
