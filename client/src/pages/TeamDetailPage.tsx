import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate, Link as RouterLink } from 'react-router-dom'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  Button,
  Chip,
  Stack,
  Box,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
  Link,
  CircularProgress,
  Alert,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import TimelineIcon from '@mui/icons-material/Timeline'
import type { Bowler, BowlerWeekStats, Team, WeekInfo } from '@bowling/shared'
import { useLeague } from '../data/LeagueContext'
import { useAuth } from '../auth/AuthContext'
import * as api from '../api/client'
import PageHeader from '../components/PageHeader'
import BowlerFormDialog, { type BowlerFormValues } from './BowlerFormDialog'
import TeamFormDialog, { type TeamFormValues } from './TeamFormDialog'
import BowlerStatsFormDialog, { type BowlerStatsFormValues } from './BowlerStatsFormDialog'

/** Build the bowler identity payload from the dialog form values. */
function toPayload(v: BowlerFormValues): Bowler {
  const b: Bowler = {
    id: v.id.trim(),
    name: v.name.trim(),
    gender: v.gender,
  }
  if (v.vacant) b.vacant = true
  return b
}

/** Build the team API payload from the team dialog form values. */
function toTeamPayload(v: TeamFormValues): Team {
  return {
    id: v.id.trim(),
    number: v.number.trim(),
    name: v.name.trim(),
    lane: v.lane,
    won: v.won,
    lost: v.lost,
    teamHdcp: v.teamHdcp,
    teamAvg: v.teamAvg,
    scratch: v.scratch,
    total: v.total,
    bowlerIds: v.bowlerIds,
  }
}

export default function TeamDetailPage() {
  const { teamId } = useParams()
  const navigate = useNavigate()
  const { league, loading, error, getTeamById, refresh } = useLeague()
  const { isAdmin } = useAuth()

  // Week-scoped bowler stats.
  const [weeks, setWeeks] = useState<WeekInfo[]>([])
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [statsByBowler, setStatsByBowler] = useState<Map<string, BowlerWeekStats>>(new Map())
  const [statsLoading, setStatsLoading] = useState(true)

  const [bowlerDialogOpen, setBowlerDialogOpen] = useState(false)
  const [editingBowler, setEditingBowler] = useState<Bowler | null>(null)
  const [teamDialogOpen, setTeamDialogOpen] = useState(false)
  const [statsDialogOpen, setStatsDialogOpen] = useState(false)
  const [statsTarget, setStatsTarget] = useState<{ bowler: Bowler; initial: BowlerWeekStats | null } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Weeks that have bowler-stat snapshots (independent of match-result weeks,
  // so a week with stats but no results still appears here).
  const loadWeeks = useCallback(async () => {
    const weekList = await api.fetchBowlerStatWeeks().catch(() => [] as WeekInfo[])
    setWeeks(weekList)
    setSelectedWeek((prev) => {
      const nums = weekList.map((w) => w.week)
      if (prev !== null && nums.includes(prev)) return prev
      return nums.length ? nums[nums.length - 1] : null
    })
  }, [])

  const loadStats = useCallback(async (week: number | null) => {
    if (week === null) {
      setStatsByBowler(new Map())
      setStatsLoading(false)
      return
    }
    setStatsLoading(true)
    try {
      const rows = await api.fetchBowlerStats(week)
      setStatsByBowler(new Map(rows.map((r) => [r.bowlerId, r])))
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load stats.')
      setStatsByBowler(new Map())
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWeeks()
  }, [loadWeeks])

  useEffect(() => {
    void loadStats(selectedWeek)
  }, [selectedWeek, loadStats])

  const reloadStats = useCallback(async () => {
    await loadWeeks()
    await loadStats(selectedWeek)
  }, [loadWeeks, loadStats, selectedWeek])

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  const team = teamId ? getTeamById(teamId) : undefined

  if (!team) {
    return (
      <>
        <PageHeader title="Team not found" />
        <Button component={RouterLink} to="/teams" startIcon={<ArrowBackIcon />}>
          Back to teams
        </Button>
      </>
    )
  }

  const bowlerById = (id: string): Bowler | undefined =>
    league.bowlers.find((b) => b.id === id)

  // --- Bowler identity CRUD ---
  const openAddBowler = () => {
    setEditingBowler(null)
    setBowlerDialogOpen(true)
  }
  const openEditBowler = (b: Bowler) => {
    setEditingBowler(b)
    setBowlerDialogOpen(true)
  }
  const handleBowlerSubmit = async (values: BowlerFormValues) => {
    const payload = toPayload(values)
    if (editingBowler) {
      await api.updateBowler(editingBowler.id, payload)
    } else {
      await api.createBowler(payload)
      await api.updateTeam(team.id, { bowlerIds: [...team.bowlerIds, payload.id] })
    }
    refresh()
  }
  const handleDeleteBowler = async (b: Bowler) => {
    if (!window.confirm(`Remove ${b.vacant ? 'this vacant slot' : b.name} from the roster?`)) return
    setActionError(null)
    try {
      await api.deleteBowler(b.id)
      await api.updateTeam(team.id, { bowlerIds: team.bowlerIds.filter((x) => x !== b.id) })
      refresh()
      await reloadStats()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  // --- Team CRUD ---
  const handleTeamSubmit = async (values: TeamFormValues) => {
    await api.updateTeam(team.id, toTeamPayload(values))
    refresh()
  }
  const handleDeleteTeam = async () => {
    if (!window.confirm(`Delete ${team.name}? This cannot be undone.`)) return
    setActionError(null)
    try {
      await api.deleteTeam(team.id)
      navigate('/teams')
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  // --- Weekly stats CRUD ---
  const openAddStats = (b: Bowler) => {
    setStatsTarget({ bowler: b, initial: null })
    setStatsDialogOpen(true)
  }
  const openEditStats = (b: Bowler, stats: BowlerWeekStats) => {
    setStatsTarget({ bowler: b, initial: stats })
    setStatsDialogOpen(true)
  }
  const handleStatsSubmit = async (values: BowlerStatsFormValues) => {
    if (statsTarget?.initial) {
      await api.updateBowlerStats(values.bowlerId, values.week, values)
    } else {
      await api.createBowlerStats(values)
      setSelectedWeek(values.week)
    }
    await reloadStats()
  }
  const handleDeleteStats = async (b: Bowler, stats: BowlerWeekStats) => {
    if (!window.confirm(`Delete week ${stats.week} stats for ${b.name}?`)) return
    setActionError(null)
    try {
      await api.deleteBowlerStats(stats.bowlerId, stats.week)
      await reloadStats()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  const num = (v: number | undefined) => (v === undefined ? '—' : v)

  return (
    <>
      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}
      >
        <Button component={RouterLink} to="/teams" startIcon={<ArrowBackIcon />} color="inherit">
          Teams
        </Button>
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setTeamDialogOpen(true)}>
              Edit team
            </Button>
            <Button variant="outlined" color="error" startIcon={<DeleteIcon />} onClick={handleDeleteTeam}>
              Delete team
            </Button>
          </Box>
        )}
      </Box>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <PageHeader
        title={team.name}
        subtitle={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, mt: 1 }}>
            <Chip size="small" label={`Lane ${team.lane}`} variant="outlined" />
            <Chip size="small" label={`Record ${team.won}–${team.lost}`} color="success" variant="outlined" />
            <Chip size="small" label={`Team Avg ${team.teamAvg}`} variant="outlined" />
            <Chip size="small" label={`Hdcp ${team.teamHdcp}`} variant="outlined" />
          </Stack>
        }
      />

      <Box
        sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 1, flexWrap: 'wrap' }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h3">Roster</Typography>
          {weeks.length > 0 && selectedWeek !== null && (
            <TextField
              select
              size="small"
              label="Stats as of week"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              sx={{ minWidth: 160 }}
            >
              {weeks.map((w) => (
                <MenuItem key={w.week} value={w.week}>
                  Week {w.week}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>
        {isAdmin && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openAddBowler}>
            Add bowler
          </Button>
        )}
      </Box>

      {statsLoading ? (
        <CircularProgress />
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Bowler</TableCell>
                <TableCell align="right">Avg</TableCell>
                <TableCell align="right">Ent Avg</TableCell>
                <TableCell align="right">Hdcp</TableCell>
                <TableCell align="right">Games</TableCell>
                <TableCell align="right">Pins</TableCell>
                <TableCell align="right">High Game</TableCell>
                <TableCell align="right">High Series</TableCell>
                <TableCell align="center">History</TableCell>
                {isAdmin && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {team.bowlerIds.map((id) => {
                const b = bowlerById(id)
                if (!b) return null
                const stats = statsByBowler.get(id)
                return (
                  <TableRow key={id} hover>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color={b.vacant ? 'text.secondary' : 'text.primary'}
                        sx={{ fontStyle: b.vacant ? 'italic' : 'normal' }}
                      >
                        {b.vacant ? 'Vacant' : b.name}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{num(stats?.avg)}</TableCell>
                    <TableCell align="right">{num(stats?.entAvg)}</TableCell>
                    <TableCell align="right">{num(stats?.hdcp)}</TableCell>
                    <TableCell align="right">{num(stats?.gamesPlayed)}</TableCell>
                    <TableCell align="right">{num(stats?.pins)}</TableCell>
                    <TableCell align="right">{num(stats?.highGame)}</TableCell>
                    <TableCell align="right">{num(stats?.highSeries)}</TableCell>
                    <TableCell align="center">
                      {!b.vacant && (
                        <Tooltip title="Week-over-week history">
                          <IconButton
                            size="small"
                            component={RouterLink}
                            to={`/bowlers/${b.id}`}
                          >
                            <TimelineIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                    {isAdmin && (
                      <TableCell align="right">
                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                          {stats ? (
                            <>
                              <Tooltip title={`Edit week ${selectedWeek} stats`}>
                                <IconButton size="small" onClick={() => openEditStats(b, stats)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title={`Delete week ${selectedWeek} stats`}>
                                <IconButton size="small" color="error" onClick={() => handleDeleteStats(b, stats)}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </>
                          ) : (
                            <Tooltip title="Add stats for this bowler">
                              <IconButton size="small" onClick={() => openAddStats(b)}>
                                <AddIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title="Edit bowler (name/identity)">
                            <IconButton size="small" onClick={() => openEditBowler(b)}>
                              <EditIcon fontSize="small" color="disabled" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Remove from roster">
                            <IconButton size="small" color="error" onClick={() => handleDeleteBowler(b)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {weeks.length === 0 && !statsLoading && (
        <Alert severity="info" sx={{ mt: 2 }}>
          No weekly stats recorded yet.
        </Alert>
      )}

      <Box sx={{ mt: 2 }}>
        <Link component={RouterLink} to="/teams" underline="hover">
          ← Back to all teams
        </Link>
      </Box>

      <BowlerFormDialog
        open={bowlerDialogOpen}
        initial={editingBowler}
        onClose={() => setBowlerDialogOpen(false)}
        onSubmit={handleBowlerSubmit}
      />

      <TeamFormDialog
        open={teamDialogOpen}
        initial={team}
        bowlers={league.bowlers}
        onClose={() => setTeamDialogOpen(false)}
        onSubmit={handleTeamSubmit}
      />

      {statsTarget && (
        <BowlerStatsFormDialog
          open={statsDialogOpen}
          bowlerId={statsTarget.bowler.id}
          bowlerName={statsTarget.bowler.name}
          initial={statsTarget.initial}
          onClose={() => setStatsDialogOpen(false)}
          onSubmit={handleStatsSubmit}
        />
      )}
    </>
  )
}
