import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Alert,
  Stack,
} from '@mui/material'
import type { Bowler, Team } from '@bowling/shared'

export interface TeamFormValues {
  id: string
  number: string
  name: string
  lane: number
  won: number
  lost: number
  teamHdcp: number
  teamAvg: number
  scratch: number
  total: number
  bowlerIds: string[]
}

const EMPTY: TeamFormValues = {
  id: '',
  number: '',
  name: '',
  lane: 0,
  won: 0,
  lost: 0,
  teamHdcp: 0,
  teamAvg: 0,
  scratch: 0,
  total: 0,
  bowlerIds: [],
}

function toForm(t: Team): TeamFormValues {
  return {
    id: t.id,
    number: t.number,
    name: t.name,
    lane: t.lane,
    won: t.won,
    lost: t.lost,
    teamHdcp: t.teamHdcp,
    teamAvg: t.teamAvg,
    scratch: t.scratch,
    total: t.total,
    bowlerIds: t.bowlerIds,
  }
}

interface Props {
  open: boolean
  /** The team being edited, or null to add a new one. */
  initial: Team | null
  bowlers: Bowler[]
  onClose: () => void
  onSubmit: (values: TeamFormValues) => Promise<void>
}

/** The numeric team stats, with display labels. */
const NUMBER_FIELDS: { key: keyof TeamFormValues; label: string }[] = [
  { key: 'lane', label: 'Lane' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'teamHdcp', label: 'Team Hdcp' },
  { key: 'teamAvg', label: 'Team Avg' },
  { key: 'scratch', label: 'Scratch' },
  { key: 'total', label: 'Total' },
]

export default function TeamFormDialog({ open, initial, bowlers, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<TeamFormValues>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Reset the form whenever the dialog opens for a different target.
  useEffect(() => {
    if (open) {
      setValues(initial ? toForm(initial) : EMPTY)
      setError(null)
    }
  }, [open, initial])

  const set = <K extends keyof TeamFormValues>(key: K, v: TeamFormValues[K]) =>
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
    if (!values.number.trim()) {
      setError('Number is required.')
      return
    }
    if (!values.name.trim()) {
      setError('Name is required.')
      return
    }
    if (!Number.isInteger(values.lane) || values.lane <= 0) {
      setError('Lane must be a positive integer.')
      return
    }
    const nonNegative: (keyof TeamFormValues)[] = [
      'won',
      'lost',
      'teamHdcp',
      'teamAvg',
      'scratch',
      'total',
    ]
    if (nonNegative.some((k) => (values[k] as number) < 0)) {
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
      <DialogTitle>{initial ? 'Edit team' : 'Add team'}</DialogTitle>
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
              label="Number"
              size="small"
              value={values.number}
              onChange={(e) => set('number', e.target.value)}
              sx={{ flex: 1, minWidth: 160 }}
            />
          </Box>
          <TextField
            label="Name"
            size="small"
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
            fullWidth
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
          <TextField
            select
            label="Roster"
            size="small"
            value={values.bowlerIds}
            onChange={(e) => {
              const v = e.target.value
              set('bowlerIds', typeof v === 'string' ? v.split(',') : (v as unknown as string[]))
            }}
            slotProps={{ select: { multiple: true } }}
            fullWidth
            helperText="Select the bowlers on this team"
          >
            {bowlers.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.vacant ? 'Vacant' : b.name}
              </MenuItem>
            ))}
          </TextField>
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
