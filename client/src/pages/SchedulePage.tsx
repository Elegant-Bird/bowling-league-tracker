import { useState } from 'react'
import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  Stack,
  Divider,
  Link,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import EventIcon from '@mui/icons-material/Event'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import type { LaneAssignment, ScheduledMatch, Team } from '@bowling/shared'
import { useLeague } from '../data/LeagueContext'
import { useAuth } from '../auth/AuthContext'
import * as api from '../api/client'
import PageHeader from '../components/PageHeader'
import ScheduleFormDialog, { type ScheduleFormValues } from './ScheduleFormDialog'

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** A derived head-to-head pairing on an adjacent pair of lanes. */
interface Pairing {
  home: LaneAssignment
  away: LaneAssignment
}

/** Group lane assignments (ordered by lane) two at a time into matchups. */
function toPairings(lanes: LaneAssignment[]): Pairing[] {
  const sorted = [...lanes].sort((a, b) => a.lane - b.lane)
  const pairings: Pairing[] = []
  for (let i = 0; i + 1 < sorted.length; i += 2) {
    pairings.push({ home: sorted[i], away: sorted[i + 1] })
  }
  return pairings
}

export default function SchedulePage() {
  const { league, loading, error, getTeamById, refresh } = useLeague()
  const { isAdmin } = useAuth()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledMatch | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (m: ScheduledMatch) => {
    setEditing(m)
    setDialogOpen(true)
  }

  const handleSubmit = async (values: ScheduleFormValues) => {
    if (editing) {
      await api.updateScheduleWeek(editing.week, values)
    } else {
      await api.createScheduleMatch(values)
    }
    refresh()
  }

  const handleDelete = async (m: ScheduledMatch) => {
    if (!window.confirm(`Delete week ${m.week} from the schedule?`)) return
    setActionError(null)
    try {
      await api.deleteScheduleWeek(m.week)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  // Team label: "Name (#number)", falling back to the id when a lookup misses.
  const teamLabel = (teamId: string): string => {
    const team: Team | undefined = getTeamById(teamId)
    if (!team) return teamId
    return `${team.name} (#${team.number})`
  }

  const weeks: ScheduledMatch[] = [...league.schedule].sort((a, b) => a.week - b.week)

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <PageHeader
          title="Upcoming Schedule"
          subtitle="Lane assignments and matchups for the coming weeks"
        />
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ mt: 1 }}>
            Add week
          </Button>
        )}
      </Box>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Stack spacing={3}>
        {weeks.map((m) => {
          const pairings = toPairings(m.lanes)
          return (
            <Card key={m.week}>
              <CardContent>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    flexWrap: 'wrap',
                    mb: 2,
                  }}
                >
                  <Typography variant="h3">Week {m.week}</Typography>
                  <Chip
                    icon={<EventIcon />}
                    label={formatDate(m.date)}
                    size="small"
                    variant="outlined"
                  />
                  <Chip label={m.format} size="small" />
                  {isAdmin && (
                    <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
                      <Tooltip title="Edit week">
                        <IconButton size="small" onClick={() => openEdit(m)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete week">
                        <IconButton size="small" color="error" onClick={() => handleDelete(m)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  )}
                </Box>

                {pairings.length === 0 ? (
                  <Typography color="text.secondary">
                    No lane assignments for this week.
                  </Typography>
                ) : (
                  <Stack divider={<Divider flexItem />} spacing={1.5}>
                    {pairings.map((p) => (
                      <Box
                        key={`${p.home.lane}-${p.away.lane}`}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 1.5,
                          flexWrap: 'wrap',
                        }}
                      >
                        <Chip
                          label={`Lanes ${p.home.lane}–${p.away.lane}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            flexWrap: 'wrap',
                          }}
                        >
                          <Link
                            component={RouterLink}
                            to={`/teams/${p.home.teamId}`}
                            underline="hover"
                            sx={{ fontWeight: 600 }}
                          >
                            {teamLabel(p.home.teamId)}
                          </Link>
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.secondary"
                          >
                            (L{p.home.lane})
                          </Typography>
                          <Typography
                            component="span"
                            color="text.secondary"
                            sx={{ mx: 0.5 }}
                          >
                            vs
                          </Typography>
                          <Link
                            component={RouterLink}
                            to={`/teams/${p.away.teamId}`}
                            underline="hover"
                            sx={{ fontWeight: 600 }}
                          >
                            {teamLabel(p.away.teamId)}
                          </Link>
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.secondary"
                          >
                            (L{p.away.lane})
                          </Typography>
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
          )
        })}
      </Stack>

      <ScheduleFormDialog
        open={dialogOpen}
        teams={league.teams}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  )
}
