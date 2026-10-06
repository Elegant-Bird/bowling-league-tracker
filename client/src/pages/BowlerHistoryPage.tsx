import { useEffect, useState } from 'react'
import { useParams, Link as RouterLink } from 'react-router-dom'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import TrendingFlatIcon from '@mui/icons-material/TrendingFlat'
import type { BowlerWeekStats } from '@bowling/shared'
import { useLeague } from '../data/LeagueContext'
import * as api from '../api/client'
import PageHeader from '../components/PageHeader'

/** Small avg trend indicator vs. the previous recorded week. */
function AvgTrend({ delta }: { delta: number | null }) {
  if (delta === null) return null
  if (delta > 0) {
    return (
      <Chip
        size="small"
        color="success"
        variant="outlined"
        icon={<TrendingUpIcon />}
        label={`+${delta}`}
      />
    )
  }
  if (delta < 0) {
    return (
      <Chip
        size="small"
        color="error"
        variant="outlined"
        icon={<TrendingDownIcon />}
        label={`${delta}`}
      />
    )
  }
  return <Chip size="small" variant="outlined" icon={<TrendingFlatIcon />} label="0" />
}

export default function BowlerHistoryPage() {
  const { bowlerId } = useParams()
  const { league, loading, error } = useLeague()
  const [history, setHistory] = useState<BowlerWeekStats[]>([])
  const [histLoading, setHistLoading] = useState(true)
  const [histError, setHistError] = useState<string | null>(null)

  useEffect(() => {
    if (!bowlerId) return
    setHistLoading(true)
    api
      .fetchBowlerHistory(bowlerId)
      .then((rows) => setHistory(rows))
      .catch((err) => setHistError(err instanceof Error ? err.message : 'Failed to load history.'))
      .finally(() => setHistLoading(false))
  }, [bowlerId])

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  const bowler = league.bowlers.find((b) => b.id === bowlerId)
  const name = bowler ? bowler.name : (bowlerId ?? 'Unknown')

  return (
    <>
      <Button
        component={RouterLink}
        to="/teams"
        startIcon={<ArrowBackIcon />}
        color="inherit"
        sx={{ mb: 2 }}
      >
        Teams
      </Button>

      <PageHeader title={name} subtitle="Week-over-week stats history" />

      {histError && <Alert severity="error" sx={{ mb: 2 }}>{histError}</Alert>}

      {histLoading ? (
        <CircularProgress />
      ) : history.length === 0 ? (
        <Alert severity="info">No weekly stats recorded for this bowler yet.</Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Week</TableCell>
                <TableCell align="right">Avg</TableCell>
                <TableCell align="center">Avg Δ</TableCell>
                <TableCell align="right">Ent Avg</TableCell>
                <TableCell align="right">Hdcp</TableCell>
                <TableCell align="right">Games</TableCell>
                <TableCell align="right">Pins</TableCell>
                <TableCell align="right">High Game</TableCell>
                <TableCell align="right">High Series</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.map((s, i) => {
                const prev = i > 0 ? history[i - 1] : null
                const delta = prev ? s.avg - prev.avg : null
                return (
                  <TableRow key={s.week} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 600 }}>Week {s.week}</Typography>
                    </TableCell>
                    <TableCell align="right">{s.avg}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                        <AvgTrend delta={delta} />
                      </Box>
                    </TableCell>
                    <TableCell align="right">{s.entAvg}</TableCell>
                    <TableCell align="right">{s.hdcp}</TableCell>
                    <TableCell align="right">{s.gamesPlayed}</TableCell>
                    <TableCell align="right">{s.pins}</TableCell>
                    <TableCell align="right">{s.highGame}</TableCell>
                    <TableCell align="right">{s.highSeries}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
