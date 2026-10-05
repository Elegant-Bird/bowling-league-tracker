import {
  Card,
  CardContent,
  Typography,
  Chip,
  Box,
  List,
  ListItem,
  ListItemText,
  Avatar,
  CircularProgress,
  Alert,
} from '@mui/material'
import Grid from '@mui/material/Grid'
import { useLeague } from '../data/LeagueContext'
import PageHeader from '../components/PageHeader'

const groupColor: Record<string, 'primary' | 'secondary' | 'default'> = {
  Male: 'secondary',
  Female: 'primary',
  Team: 'default',
}

const medalColor = ['#f5a623', '#c0c0c0', '#cd7f32']

export default function LeaderboardsPage() {
  const { league, loading, error } = useLeague()

  if (loading) return <CircularProgress />
  if (error) return <Alert severity="error">{error}</Alert>
  if (!league) return null

  return (
    <>
      <PageHeader
        title="Season Leaderboards"
        subtitle={`Top performers through Week ${league.currentWeek}`}
      />

      <Grid container spacing={3}>
        {league.leaderboards.map((lb, idx) => (
          <Grid key={idx} size={{ xs: 12, md: 6 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography variant="h3">{lb.title}</Typography>
                  <Chip size="small" label={lb.group} color={groupColor[lb.group]} variant="outlined" />
                </Box>
                <List dense disablePadding>
                  {lb.entries.map((e) => (
                    <ListItem key={e.rank} disableGutters>
                      <Avatar
                        sx={{
                          width: 26,
                          height: 26,
                          mr: 1.5,
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          bgcolor: medalColor[e.rank - 1] ?? 'background.default',
                          color: e.rank <= 3 ? '#1a1200' : 'text.secondary',
                        }}
                      >
                        {e.rank}
                      </Avatar>
                      <ListItemText primary={e.teamName ?? e.bowlerName} />
                      <Typography sx={{ fontWeight: 700 }}>{e.value}</Typography>
                    </ListItem>
                  ))}
                </List>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </>
  )
}
