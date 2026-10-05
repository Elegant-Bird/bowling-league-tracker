import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  IconButton,
  Box,
  Typography,
  Alert,
  Stack,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import type { LaneAssignment, ScheduledMatch, Team } from '@bowling/shared'

export interface ScheduleFormValues {
  week: number
  date: string
  format: string
  lanes: LaneAssignment[]
}

const EMPTY: ScheduleFormValues = {
  week: 1,
  date: '',
  format: 'Normal',
  lanes: [],
}

function toForm(m: ScheduledMatch): ScheduleFormValues {
  return {
    week: m.week,
    date: m.date,
    format: m.format,
    lanes: m.lanes.map((l) => ({ ...l })),
  }
}

interface Props {
  open: boolean
  teams: Team[]
  /** The week being edited, or null to add a new one. */
  initial: ScheduledMatch | null
  onClose: () => void
  onSubmit: (values: ScheduleFormValues) => Promise<void>
}

export default function ScheduleFormDialog({ open, teams, initial, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<ScheduleFormValues>(EMPTY)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Reset the form whenever the dialog opens for a different target.
  useEffect(() => {
    if (open) {
      setValues(initial ? toForm(initial) : EMPTY)
      setError(null)
    }
  }, [open, initial])

  const isEditing = initial !== null

  const set = <K extends keyof ScheduleFormValues>(key: K, v: ScheduleFormValues[K]) =>
    setValues((prev) => ({ ...prev, [key]: v }))

  // Parse an <input type="number"> string value into a number (empty → 0).
  const numField = (v: string): number => {
    const n = Number(v)
    return Number.isNaN(n) ? 0 : n
  }

  const setLaneRow = (idx: number, patch: Partial<LaneAssignment>) =>
    setValues((prev) => {
      const lanes = prev.lanes.map((l, i) => (i === idx ? { ...l, ...patch } : l))
      return { ...prev, lanes }
    })

  const addLane = () =>
    setValues((prev) => ({ ...prev, lanes: [...prev.lanes, { lane: 0, teamId: '' }] }))

  const removeLane = (idx: number) =>
    setValues((prev) => ({ ...prev, lanes: prev.lanes.filter((_, i) => i !== idx) }))

  async function handleSubmit() {
    setError(null)
    if (!Number.isInteger(values.week) || values.week <= 0) {
      setError('Week must be a positive integer.')
      return
    }
    if (!values.date.trim()) {
      setError('Date is required (e.g. "2026-09-30").')
      return
    }
    if (!values.format.trim()) {
      setError('Format is required.')
      return
    }
    for (const l of values.lanes) {
      if (!Number.isInteger(l.lane) || l.lane <= 0) {
        setError('Every lane must be a positive integer.')
        return
      }
      if (!l.teamId) {
        setError('Every lane must have a team selected.')
        return
      }
    }
    const payload: ScheduleFormValues = {
      ...values,
      date: values.date.trim(),
      format: values.format.trim(),
      lanes: [...values.lanes].sort((a, b) => a.lane - b.lane),
    }
    setBusy(true)
    try {
      await onSubmit(payload)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEditing ? 'Edit week' : 'Add week'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label="Week"
              type="number"
              size="small"
              value={values.week}
              onChange={(e) => set('week', numField(e.target.value))}
              disabled={isEditing}
              helperText={isEditing ? 'Week cannot be changed' : undefined}
            />
            <TextField
              label="Date"
              type="date"
              size="small"
              value={values.date}
              onChange={(e) => set('date', e.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="ISO date (YYYY-MM-DD)"
            />
            <TextField
              label="Format"
              size="small"
              value={values.format}
              onChange={(e) => set('format', e.target.value)}
            />
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Lane assignments
            </Typography>
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={addLane}
              sx={{ ml: 'auto' }}
            >
              Add lane
            </Button>
          </Box>

          {values.lanes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No lanes yet. Adjacent lane pairs (lowest two, next two, …) face each other.
            </Typography>
          ) : (
            <Stack spacing={1.5}>
              {values.lanes.map((l, idx) => (
                <Box key={idx} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <TextField
                    label="Lane"
                    type="number"
                    size="small"
                    value={l.lane}
                    onChange={(e) => setLaneRow(idx, { lane: numField(e.target.value) })}
                    sx={{ width: 110 }}
                  />
                  <TextField
                    select
                    label="Team"
                    size="small"
                    value={l.teamId}
                    onChange={(e) => setLaneRow(idx, { teamId: e.target.value })}
                    fullWidth
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
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => removeLane(idx)}
                    aria-label="Remove lane"
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}
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
