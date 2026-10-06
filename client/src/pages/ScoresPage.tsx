import { useCallback, useEffect, useState } from 'react'
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
  Link,
  Stack,
  Button,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import PersonOffIcon from '@mui/icons-material/PersonOff'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import {
  computeMatchScoring,
  type MatchResult,
  type PointWinner,
  type WeeklyReport,
  type WeekInfo,
} from '@bowling/shared'
import { useLeague } from '../data/LeagueContext'
import { useAuth } from '../auth/AuthContext'
import * as api from '../api/client'
import PageHeader from '../components/PageHeader'
import ResultFormDialog, { type ResultFormValues } from './ResultFormDialog'

/** Cell background when this side won the point (game or series). */
function wonSx(isWinner: boolean) {
  return isWinner
    ? { bgcolor: 'success.main', color: 'success.contrastText', fontWeight: 700 }
    : {}
}

/** Render points as a compact number, showing halves (2, 0.5, 1.5…). */
function formatPoints(p: number): string {
  return Number.isInteger(p) ? String(p) : p.toFixed(1)
}

/** Format an ISO date (YYYY-MM-DD) for display; empty → ''. */
function formatDate(iso: string): string {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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
  const { league, loading: leagueLoading, error: leagueError, getTeamById } = useLeague()
  const { isAdmin } = useAuth()

  // Week-scoped state (independent of the one-week league payload).
  const [weeks, setWeeks] = useState<WeekInfo[]>([])
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null)
  const [results, setResults] = useState<MatchResult[]>([])
  const [reports, setReports] = useState<WeeklyReport[]>([])
  const [weekLoading, setWeekLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MatchResult | null>(null)

  // Load the list of weeks that have results (+ reports), defaulting the
  // selection to the latest week. Keeps a valid selection if the set changes.
  const loadWeeks = useCallback(async () => {
    const [weekList, reportList] = await Promise.all([
      api.fetchResultWeeks(),
      api.fetchReports().catch(() => [] as WeeklyReport[]),
    ])
    setWeeks(weekList)
    setReports(reportList)
    setSelectedWeek((prev) => {
      const weekNums = weekList.map((w) => w.week)
      if (prev !== null && weekNums.includes(prev)) return prev
      return weekNums.length ? weekNums[weekNums.length - 1] : null
    })
  }, [])

  // Fetch the results for the currently selected week.
  const loadResults = useCallback(async (week: number | null) => {
    if (week === null) {
      setResults([])
      setWeekLoading(false)
      return
    }
    setWeekLoading(true)
    try {
      const rows = await api.fetchResultsByWeek(week)
      setResults(rows)
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to load results.')
      setResults([])
    } finally {
      setWeekLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadWeeks()
  }, [loadWeeks])

  useEffect(() => {
    void loadResults(selectedWeek)
  }, [selectedWeek, loadResults])

  // After any admin mutation, refresh the week list and the current results.
  const reloadAll = useCallback(async () => {
    await loadWeeks()
    await loadResults(selectedWeek)
  }, [loadWeeks, loadResults, selectedWeek])

  if (leagueLoading) return <CircularProgress />
  if (leagueError) return <Alert severity="error">{leagueError}</Alert>
  if (!league) return null

  const teamLabel = (teamId: string): string => {
    const team = getTeamById(teamId)
    return team ? `${team.name} (#${team.number})` : teamId
  }

  // The uploaded PDF report for the selected week, if one exists.
  const weekReport =
    selectedWeek !== null ? reports.find((r) => r.week === selectedWeek) : undefined

  // Date for the selected week (from the normalized weeks collection).
  const selectedWeekDate =
    selectedWeek !== null ? (weeks.find((w) => w.week === selectedWeek)?.date ?? '') : ''

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
      // If this week has no recorded date yet, offer to set one so the
      // history reads nicely. (Dates can also be edited later.)
      const existing = weeks.find((w) => w.week === payload.week)
      if (!existing || !existing.date) {
        const entered = window.prompt(
          `Date for Week ${payload.week}? (YYYY-MM-DD, optional)`,
          '',
        )
        if (entered && entered.trim()) {
          try {
            await api.setWeekDate(payload.week, entered.trim())
          } catch {
            setActionError('Result saved, but the week date could not be set.')
          }
        }
      }
      // Jump to the week just created so the admin sees their entry.
      setSelectedWeek(payload.week)
    }
    await reloadAll()
  }

  const handleDelete = async (r: MatchResult) => {
    if (!r.id) return
    if (!window.confirm(`Delete the result on lanes ${r.lanes} (week ${r.week})?`)) return
    setActionError(null)
    try {
      await api.deleteResult(r.id)
      await reloadAll()
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
        <TableCell key={i} align="center">
          <Chip sx={wonSx(gameWinners[i] === side)} label={g}></Chip>
        </TableCell>
      ))}
      <TableCell align="center">
        <Chip sx={wonSx(seriesWinner === side)} label={series}></Chip>
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
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <PageHeader
          title="Scores"
          subtitle={
            selectedWeek !== null
              ? `Week ${selectedWeek}${selectedWeekDate ? ` · ${formatDate(selectedWeekDate)}` : ''} — highlighted cells show the point winner`
              : 'Match results by week — highlighted cells show the point winner'
          }
        />
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
          {weeks.length > 0 && selectedWeek !== null && (
            <TextField
              select
              size="small"
              label="Week"
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(Number(e.target.value))}
              sx={{ minWidth: 200 }}
            >
              {weeks.map((w) => (
                <MenuItem key={w.week} value={w.week}>
                  Week {w.week}
                  {w.date ? ` — ${formatDate(w.date)}` : ''}
                </MenuItem>
              ))}
            </TextField>
          )}
          {isAdmin && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openAdd}>
              Add result
            </Button>
          )}
        </Box>
      </Box>

      {weekReport && (
        <Button
          component="a"
          href={api.getReportUrl(weekReport.id)}
          target="_blank"
          rel="noreferrer"
          startIcon={<PictureAsPdfIcon />}
          variant="outlined"
          size="small"
          sx={{ mb: 2 }}
        >
          View original sheet for Week {selectedWeek}
        </Button>
      )}

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {weekLoading ? (
        <CircularProgress />
      ) : weeks.length === 0 ? (
        <Alert severity="info">No scores have been entered yet.</Alert>
      ) : results.length === 0 ? (
        <Alert severity="info">No results for week {selectedWeek}.</Alert>
      ) : (
        <Stack spacing={3}>{results.map((r, idx) => renderMatch(r, idx))}</Stack>
      )}

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
