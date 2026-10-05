import { useState } from 'react'
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
  CircularProgress,
  Alert,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import type { Bowler, Team } from '@bowling/shared'
import { useLeague } from '../data/LeagueContext'
import { useAuth } from '../auth/AuthContext'
import * as api from '../api/client'
import PageHeader from '../components/PageHeader'
import BowlerFormDialog, { type BowlerFormValues } from './BowlerFormDialog'
import TeamFormDialog, { type TeamFormValues } from './TeamFormDialog'

/** Build the API payload from the dialog form values. */
function toPayload(v: BowlerFormValues): Bowler {
  return {
    id: v.id.trim(),
    name: v.name.trim(),
    gender: v.gender,
    avg: v.avg,
    entAvg: v.entAvg,
    hdcp: v.hdcp,
    gamesPlayed: v.gamesPlayed,
    pins: v.pins,
    highGame: v.highGame,
    highSeries: v.highSeries,
    vacant: v.vacant,
  }
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
  const { league, loading, error, getTeamById, getBowlerById, refresh } = useLeague()
  const { isAdmin } = useAuth()

  const [bowlerDialogOpen, setBowlerDialogOpen] = useState(false)
  const [editingBowler, setEditingBowler] = useState<Bowler | null>(null)
  const [teamDialogOpen, setTeamDialogOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

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
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  const handleTeamSubmit = async (values: TeamFormValues) => {
    const payload = toTeamPayload(values)
    await api.updateTeam(team.id, payload)
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

  return (
    <>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          mb: 2,
          flexWrap: 'wrap',
        }}
      >
        <Button
          component={RouterLink}
          to="/teams"
          startIcon={<ArrowBackIcon />}
          color="inherit"
        >
          Teams
        </Button>
        {isAdmin && (
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<EditIcon />}
              onClick={() => setTeamDialogOpen(true)}
            >
              Edit team
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleDeleteTeam}
            >
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
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          mb: 1,
          flexWrap: 'wrap',
        }}
      >
        <Typography variant="h3">Roster</Typography>
        {isAdmin && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={openAddBowler}>
            Add bowler
          </Button>
        )}
      </Box>

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
              {isAdmin && <TableCell align="right">Actions</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {team.bowlerIds.map((id) => {
              const b = getBowlerById(id)
              if (!b) return null
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
                  <TableCell align="right">{b.avg}</TableCell>
                  <TableCell align="right">{b.entAvg}</TableCell>
                  <TableCell align="right">{b.hdcp}</TableCell>
                  <TableCell align="right">{b.gamesPlayed}</TableCell>
                  <TableCell align="right">{b.pins}</TableCell>
                  <TableCell align="right">{b.highGame}</TableCell>
                  <TableCell align="right">{b.highSeries}</TableCell>
                  {isAdmin && (
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Edit bowler">
                          <IconButton size="small" onClick={() => openEditBowler(b)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete bowler">
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
    </>
  )
}
