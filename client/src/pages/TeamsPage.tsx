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
  CircularProgress,
  Alert,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import PersonIcon from '@mui/icons-material/Person'
import { useLeague } from '../data/LeagueContext'
import PageHeader from '../components/PageHeader'

export default function TeamsPage() {
  const { league, loading, error, getBowlerById } = useLeague()

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  return (
    <>
      <PageHeader title="Teams" subtitle={`${league.teams.length} teams this season`} />

      <Grid container spacing={3}>
        {league.teams.map((team) => (
          <Grid key={team.id} size={{ xs: 12, sm: 6, md: 4 }}>
            <Card sx={{ height: '100%' }}>
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
    </>
  )
}
