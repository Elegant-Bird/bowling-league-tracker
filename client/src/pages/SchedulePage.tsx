import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
} from '@mui/material'
import EventIcon from '@mui/icons-material/Event'
import { useLeague } from '../data/LeagueContext'
import PageHeader from '../components/PageHeader'

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function SchedulePage() {
  const { league, loading, error } = useLeague()

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  return (
    <>
      <PageHeader title="Upcoming Schedule" subtitle="Lane assignments for the coming weeks" />

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell align="right">Week</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Format</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {league.schedule.map((m) => (
              <TableRow key={m.week} hover>
                <TableCell align="right">{m.week}</TableCell>
                <TableCell>
                  <Chip
                    icon={<EventIcon />}
                    label={formatDate(m.date)}
                    size="small"
                    variant="outlined"
                  />
                </TableCell>
                <TableCell>{m.format}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  )
}
