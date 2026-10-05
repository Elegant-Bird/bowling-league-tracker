import { useParams, Link as RouterLink } from 'react-router-dom'
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
  CircularProgress,
  Alert,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { useLeague } from '../data/LeagueContext'
import PageHeader from '../components/PageHeader'

export default function TeamDetailPage() {
  const { teamId } = useParams()
  const { league, loading, error, getTeamById, getBowlerById } = useLeague()

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

  return (
    <>
      <Button
        component={RouterLink}
        to="/teams"
        startIcon={<ArrowBackIcon />}
        sx={{ mb: 2 }}
        color="inherit"
      >
        Teams
      </Button>

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

      <Box sx={{ mb: 1 }}>
        <Typography variant="h3">Roster</Typography>
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
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
