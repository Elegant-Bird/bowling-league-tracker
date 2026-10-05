import { Link as RouterLink } from 'react-router-dom'
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Link,
  Chip,
  Avatar,
  CircularProgress,
  Alert,
} from '@mui/material'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { useLeague } from '../data/LeagueContext'
import PageHeader from '../components/PageHeader'

const medalColor = ['#f5a623', '#c0c0c0', '#cd7f32']

export default function StandingsPage() {
  const { league, loading, error } = useLeague()

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  const teams = [...league.teams].sort((a, b) => b.won - a.won)

  return (
    <>
      <PageHeader
        title="Standings"
        subtitle={`${league.split} · through Week ${league.currentWeek}`}
      />

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Pos</TableCell>
              <TableCell align="right">Lane</TableCell>
              <TableCell>Team</TableCell>
              <TableCell align="right">Won</TableCell>
              <TableCell align="right">Lost</TableCell>
              <TableCell align="right">Hdcp</TableCell>
              <TableCell align="right">Avg</TableCell>
              <TableCell align="right">Scratch</TableCell>
              <TableCell align="right">Total</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {teams.map((team, i) => (
              <TableRow key={team.id} hover>
                <TableCell>
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      fontSize: '0.85rem',
                      bgcolor: medalColor[i] ?? 'background.default',
                      color: i < 3 ? '#1a1200' : 'text.secondary',
                      fontWeight: 700,
                    }}
                  >
                    {i < 3 ? <EmojiEventsIcon fontSize="small" /> : i + 1}
                  </Avatar>
                </TableCell>
                <TableCell align="right">{team.lane}</TableCell>
                <TableCell>
                  <Link component={RouterLink} to={`/teams/${team.id}`} underline="hover">
                    {team.name}
                  </Link>
                </TableCell>
                <TableCell align="right">
                  <Chip size="small" label={team.won} color="success" variant="outlined" />
                </TableCell>
                <TableCell align="right">{team.lost}</TableCell>
                <TableCell align="right">{team.teamHdcp}</TableCell>
                <TableCell align="right">{team.teamAvg}</TableCell>
                <TableCell align="right">{team.scratch}</TableCell>
                <TableCell align="right">
                  <strong>{team.total}</strong>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
