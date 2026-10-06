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

// A bowler is identity-only now (id, name, gender, vacant). Weekly cumulative
// stats are edited separately per week (see BowlerStatsFormDialog).
export interface BowlerFormValues {
  id: string
  name: string
  gender: Gender
  vacant: boolean
}

const EMPTY: BowlerFormValues = {
  id: '',
  name: '',
  gender: 'M',
  vacant: false,
}

function toForm(b: Bowler): BowlerFormValues {
  return {
    id: b.id,
    name: b.name,
    gender: b.gender,
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
          <FormControlLabel
            control={
              <Checkbox
                checked={values.vacant}
                onChange={(e) => set('vacant', e.target.checked)}
              />
            }
            label="Vacant roster slot"
          />
          <Alert severity="info" variant="outlined">
            Weekly stats (average, pins, high game, etc.) are edited per week
            from the roster's stat controls, not here.
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
