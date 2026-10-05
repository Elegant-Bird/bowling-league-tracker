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
  Alert,
  Stack,
} from '@mui/material'
import type { Bowler, Gender } from '@bowling/shared'

export interface BowlerFormValues {
  id: string
  name: string
  gender: Gender
  avg: number
  entAvg: number
  hdcp: number
  gamesPlayed: number
  pins: number
  highGame: number
  highSeries: number
  vacant: boolean
}

const EMPTY: BowlerFormValues = {
  id: '',
  name: '',
  gender: 'M',
  avg: 0,
  entAvg: 0,
  hdcp: 0,
  gamesPlayed: 0,
  pins: 0,
  highGame: 0,
  highSeries: 0,
  vacant: false,
}

function toForm(b: Bowler): BowlerFormValues {
  return {
    id: b.id,
    name: b.name,
    gender: b.gender,
    avg: b.avg,
    entAvg: b.entAvg,
    hdcp: b.hdcp,
    gamesPlayed: b.gamesPlayed,
    pins: b.pins,
    highGame: b.highGame,
    highSeries: b.highSeries,
    vacant: b.vacant ?? false,
  }
}

interface Props {
  open: boolean
  /** The bowler being edited, or null to add a new one. */
  initial: Bowler | null
  onClose: () => void
  onSubmit: (values: BowlerFormValues) => Promise<void>
}

/** The seven numeric roster stats, with display labels. */
const NUMBER_FIELDS: { key: keyof BowlerFormValues; label: string }[] = [
  { key: 'avg', label: 'Avg' },
  { key: 'entAvg', label: 'Ent Avg' },
  { key: 'hdcp', label: 'Hdcp' },
  { key: 'gamesPlayed', label: 'Games' },
  { key: 'pins', label: 'Pins' },
  { key: 'highGame', label: 'High Game' },
  { key: 'highSeries', label: 'High Series' },
]

export default function BowlerFormDialog({ open, initial, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<BowlerFormValues>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Reset the form whenever the dialog opens for a different target.
  useEffect(() => {
    if (open) {
      setValues(initial ? toForm(initial) : EMPTY)
      setError(null)
    }
  }, [open, initial])

  const set = <K extends keyof BowlerFormValues>(key: K, v: BowlerFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }))

  // Parse an <input type="number"> string value into a number (empty → 0).
  const numField = (v: string): number => {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }

  async function handleSubmit() {
    setError(null)
    if (!values.id.trim()) {
      setError('Identifier is required.')
      return
    }
    if (!values.name.trim()) {
      setError('Name is required.')
      return
    }
    const numericValues = NUMBER_FIELDS.map((f) => values[f.key] as number)
    if (numericValues.some((n) => n < 0)) {
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
      <DialogTitle>{initial ? 'Edit bowler' : 'Add bowler'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Identifier"
              size="small"
              value={values.id}
              onChange={(e) => set('id', e.target.value)}
              disabled={initial !== null}
              helperText={initial !== null ? 'Identifier cannot be changed' : undefined}
              sx={{ flex: 1, minWidth: 160 }}
            />
            <TextField
              label="Name"
              size="small"
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              sx={{ flex: 1, minWidth: 160 }}
            />
          </Box>
          <TextField
            select
            label="Gender"
            size="small"
            value={values.gender}
            onChange={(e) => set('gender', e.target.value as Gender)}
            sx={{ maxWidth: 160 }}
          >
            <MenuItem value="M">M</MenuItem>
            <MenuItem value="F">F</MenuItem>
          </TextField>
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
          <FormControlLabel
            control={
              <Checkbox
                checked={values.vacant}
                onChange={(e) => set('vacant', e.target.checked)}
              />
            }
            label="Vacant roster slot"
          />
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
