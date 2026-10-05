import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import {
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Box,
  Typography,
  Link,
  Stack,
  Button,
  IconButton,
  Tooltip,
  CircularProgress,
  Alert,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PersonOffIcon from '@mui/icons-material/PersonOff'
import { computeMatchScoring, type MatchResult, type PointWinner } from '@bowling/shared'
import { useLeague } from '../data/LeagueContext'
import { useAuth } from '../auth/AuthContext'
import * as api from '../api/client'
import PageHeader from '../components/PageHeader'
import ResultFormDialog, { type ResultFormValues } from './ResultFormDialog'

/** Cell background when this side won the point (game or series). */
function wonSx(isWinner: boolean) {
  return isWinner
    ? { bgcolor: 'success.main', color: 'success.contrastText', fontWeight: 700, borderRadius: 1 }
    : {}
}

/** Render points as a compact number, showing halves (2, 0.5, 1.5…). */
function formatPoints(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1)
}

/** Build the API payload from the dialog form values. */
function toPayload(v: ResultFormValues): MatchResult {
  return {
    week: v.week,
    lanes: v.lanes.trim(),
    homeTeamId: v.homeTeamId,
    awayTeamId: v.awayTeamId,
    homeGames: v.homeGames,
    awayGames: v.awayGames,
    homeSeries: v.homeSeries,
    awaySeries: v.awaySeries,
    homePoints: v.homePoints,
    awayPoints: v.awayPoints,
    homeAbsent: v.homeAbsent,
    awayAbsent: v.awayAbsent,
  }
}

export default function ScoresPage() {
  const { league, loading, error, getTeamById, refresh } = useLeague()
  const { isAdmin } = useAuth()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MatchResult | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  const teamLabel = (teamId: string): string => {
    const team = getTeamById(teamId)
    return team ? `${team.name} (#${team.number})` : teamId
  }

  const openAdd = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (r: MatchResult) => {
    setEditing(r)
    setDialogOpen(true)
  }

  const handleSubmit = async (values: ResultFormValues) => {
    const payload = toPayload(values)
    if (editing?.id) {
      await api.updateResult(editing.id, payload)
    } else {
      await api.createResult(payload)
    }
    refresh()
  }

  const handleDelete = async (r: MatchResult) => {
    if (!r.id) return
    if (!window.confirm(`Delete the result on lanes ${r.lanes} (week ${r.week})?`)) return
    setActionError(null)
    try {
      await api.deleteResult(r.id)
      refresh()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Delete failed.')
    }
  }

  const renderTeamRow = (
    teamId: string,
    games: number[],
    series: number,
    points: number,
    side: 'home' | 'away',
    gameWinners: PointWinner[],
    seriesWinner: PointWinner,
    isMatchWinner: boolean,
    absent: boolean,
  ) => (
    <TableRow>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Link
            component={RouterLink}
            to={`/teams/${teamId}`}
            underline="hover"
            sx={{ fontWeight: isMatchWinner ? 700 : 500 }}
          >
            {teamLabel(teamId)}
          </Link>
          {absent && (
            <Tooltip title="Absent — vacant scores (team average + handicap) were used">
              <Chip
                icon={<PersonOffIcon />}
                label="Vacant"
                size="small"
                color="warning"
                variant="outlined"
              />
            </Tooltip>
          )}
        </Box>
      </TableCell>
      {games.map((g, i) => (
        <TableCell key={i} align="center" sx={wonSx(gameWinners[i] === side)}>
          {g}
        </TableCell>
      ))}
      <TableCell align="center" sx={wonSx(seriesWinner === side)}>
        {series}
      </TableCell>
      <TableCell align="center">
        <Chip
          size="small"
          label={formatPoints(points)}
          color={isMatchWinner ? 'success' : 'default'}
          variant={isMatchWinner ? 'filled' : 'outlined'}
        />
      </TableCell>
    </TableRow>
  )

  const renderMatch = (r: MatchResult, idx: number) => {
    const scoring = computeMatchScoring(r)
    const gameWinners = scoring.games.map((g) => g.winner)
    const gameCount = scoring.games.length
    const homeWins = r.homePoints > r.awayPoints
    const awayWins = r.awayPoints > r.homePoints

    return (
      <Card key={r.id ?? idx}>
        <CardContent>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: 1.5,
              flexWrap: 'wrap',
            }}
          >
            <Chip size="small" label={`Lanes ${r.lanes}`} color="primary" variant="outlined" />
            <Typography variant="h3">Week {r.week}</Typography>
            {isAdmin && (
              <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
                <Tooltip title="Edit result">
                  <IconButton size="small" onClick={() => openEdit(r)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete result">
                  <IconButton size="small" color="error" onClick={() => handleDelete(r)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Box>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Team</TableCell>
                {Array.from({ length: gameCount }, (_, i) => (
                  <TableCell key={i} align="center">
                    Game {i + 1}
                  </TableCell>
                ))}
                <TableCell align="center">Series</TableCell>
                <TableCell align="center">Points</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {renderTeamRow(
                r.homeTeamId,
                r.homeGames,
                r.homeSeries,
                r.homePoints,
                'home',
                gameWinners,
                scoring.seriesWinner,
                homeWins,
                r.homeAbsent ?? false,
              )}
              {renderTeamRow(
                r.awayTeamId,
                r.awayGames,
                r.awaySeries,
                r.awayPoints,
                'away',
                gameWinners,
                scoring.seriesWinner,
                awayWins,
                r.awayAbsent ?? false,
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
        <PageHeader
          title="Last Week's Scores"
          subtitle="Match results from the previous week — highlighted cells show the point winner"
        />
        {isAdmin && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd} sx={{ mt: 1 }}>
            Add result
          </Button>
        )}
      </Box>

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      <Stack spacing={3}>
        {league.lastWeekResults.map((r, idx) => renderMatch(r, idx))}
      </Stack>

      <ResultFormDialog
        open={dialogOpen}
        teams={league.teams}
        initial={editing}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmit}
      />
    </>
  )
}
