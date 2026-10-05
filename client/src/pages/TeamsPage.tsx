import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Card,
  CardActionArea,
  CardContent,
  Typography,
  Chip,
  Box,
  Stack,
  Avatar,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import PersonIcon from '@mui/icons-material/Person'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import type { Team } from '@bowling/shared'
import { useLeague } from '../data/LeagueContext'
import { useAuth } from '../auth/AuthContext'
import * as api from '../api/client'
import PageHeader from '../components/PageHeader'
import TeamFormDialog, { type TeamFormValues } from './TeamFormDialog'

/** Build the API payload from the dialog form values. */
function toPayload(v: TeamFormValues): Team {
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

export default function TeamsPage() {
  const { league, loading, error, getBowlerById, refresh } = useLeague()
  const { isAdmin } = useAuth()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Team | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }

  const openEdit = (team: Team) => {
    setEditing(team)
    setDialogOpen(true)
  }

  const handleSubmit = async (values: TeamFormValues) => {
    const payload = toPayload(values)
    if (editing) {
      await api.updateTeam(editing.id, payload)
    } else {
      await api.createTeam(payload)
    }
    refresh()
  }

  const handleDelete = async (team: Team) => {
    if (!window.confirm(`Delete ${team.name}? This cannot be undone.`)) return
    setActionError(null)
    try {
      await api.deleteTeam(team.id)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <PageHeader title="Teams" subtitle={`${league.teams.length} teams this season`} />
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ mt: 1 }}>
            Add team
          </Button>
        )}
      </Box>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Grid container spacing={3}>
        {league.teams.map((team) => (
          <Grid key={team.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card sx={{ height: '100%', position: 'relative' }}>
              {isAdmin && (
                <Box
                  sx={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    zIndex: 1,
                    display: 'flex',
                    gap: 0.5,
                  }}
                >
                  <Tooltip title="Edit team">
                    <IconButton size="small" onClick={() => openEdit(team)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete team">
                    <IconButton size="small" color="error" onClick={() => handleDelete(team)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              <CardActionArea component={RouterLink} to={`/teams/${team.id}`} sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="h3" gutterBottom>
                    {team.name}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap', gap: 1 }}>
                    <Chip size="small" label={`Lane ${team.lane}`} variant="outlined" />
                    <Chip size="small" label={`${team.won}–${team.lost}`} color="success" variant="outlined" />
                    <Chip size="small" label={`Avg ${team.teamAvg}`} variant="outlined" />
                  </Stack>
                  <Stack spacing={1}>
                    {team.bowlerIds.map((id) => {
                      const b = getBowlerById(id)
                      if (!b) return null
                      return (
                        <Box key={id} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Avatar sx={{ width: 24, height: 24, bgcolor: 'background.default' }}>
                            <PersonIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          </Avatar>
                          <Typography
                            variant="body2"
                            color={b.vacant ? 'text.secondary' : 'text.primary'}
                            sx={{ fontStyle: b.vacant ? 'italic' : 'normal' }}
                          >
                            {b.vacant ? 'Vacant' : b.name}
                          </Typography>
                        </Box>
                      )
                    })}
                  </Stack>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <TeamFormDialog
        open={dialogOpen}
        initial={editing}
        bowlers={league.bowlers}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  )
}
