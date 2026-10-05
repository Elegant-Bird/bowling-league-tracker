import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Box,
  Typography,
  CircularProgress,
  Alert,
} from '@mui/material'
import { useLeague } from '../data/LeagueContext'
import PageHeader from '../components/PageHeader'

export default function ScoresPage() {
  const { league, loading, error, getTeamById } = useLeague()

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  return (
    <>
      <PageHeader title="Last Week's Scores" subtitle="Match results from the previous week" />

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Lanes</TableCell>
              <TableCell>Match</TableCell>
              <TableCell align="right">Series</TableCell>
              <TableCell align="center">Points</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {league.lastWeekResults.map((r, idx) => {
              const home = getTeamById(r.homeTeamId)
              const away = getTeamById(r.awayTeamId)
              const homeWon = r.homePoints >= r.awayPoints
              return (
                <TableRow key={idx} hover>
                  <TableCell>
                    <Chip size="small" label={r.lanes} variant="outlined" />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography component="span" sx={{ fontWeight: homeWon ? 700 : 400 }}>
                        {home?.name ?? r.homeTeamId}
                      </Typography>
                      <Typography component="span" color="text.secondary" variant="body2">
                        vs
                      </Typography>
                      <Typography component="span" sx={{ fontWeight: !homeWon ? 700 : 400 }}>
                        {away?.name ?? r.awayTeamId}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {r.homeSeries} – {r.awaySeries}
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={`${r.homePoints} – ${r.awayPoints}`}
                      color={homeWon ? 'success' : 'default'}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
