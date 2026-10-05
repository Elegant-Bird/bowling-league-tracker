import { useState } from 'react'
import { Link as RouterLink, NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  AppBar,
  Toolbar,
  Typography,
  Tabs,
  Tab,
  Box,
  Button,
  Container,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Chip,
  useMediaQuery,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import MenuIcon from '@mui/icons-material/Menu'
import AdjustIcon from '@mui/icons-material/Adjust'
import LogoutIcon from '@mui/icons-material/Logout'
import LoginIcon from '@mui/icons-material/Login'
import { useAuth } from '../auth/AuthContext'
import { useLeague } from '../data/LeagueContext'

const navItems = [
  { to: '/standings', label: 'Standings' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/scores', label: 'Scores' },
  { to: '/teams', label: 'Teams' },
  { to: '/leaderboards', label: 'Leaderboards' },
  { to: '/reports', label: 'Reports' },
  { to: '/rules', label: 'Rules' },
]

export default function Layout() {
  const { user, signOut } = useAuth()
  const { league } = useLeague()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const location = useLocation()
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Which top-level tab is active (handles nested routes like /teams/:id).
  const activeTab =
    navItems.find((item) => location.pathname.startsWith(item.to))?.to ?? false

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 2 }}>
          {isMobile && (
            <IconButton edge="start" color="inherit" onClick={() => setDrawerOpen(true)} aria-label="menu">
              <MenuIcon />
            </IconButton>
          )}

          <AdjustIcon sx={{ color: 'primary.main' }} />
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{ fontWeight: 800, color: 'text.primary', textDecoration: 'none', mr: 2 }}
          >
            {league?.season ?? ''}
          </Typography>

          {!isMobile && (
            <Tabs
              value={activeTab}
              textColor="inherit"
              indicatorColor="primary"
              sx={{ flexGrow: 1 }}
            >
              {navItems.map((item) => (
                <Tab
                  key={item.to}
                  label={item.label}
                  value={item.to}
                  component={NavLink}
                  to={item.to}
                />
              ))}
            </Tabs>
          )}

          <Box sx={{ flexGrow: isMobile ? 1 : 0 }} />

          {user ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              {!isMobile && <Chip size="small" label={user.username} color="primary" variant="outlined" />}
              <Button color="inherit" startIcon={<LogoutIcon />} onClick={signOut}>
                Sign out
              </Button>
            </Box>
          ) : (
            <Button
              color="primary"
              variant="outlined"
              startIcon={<LoginIcon />}
              component={RouterLink}
              to="/login"
            >
              Admin
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Drawer anchor="left" open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Box sx={{ width: 240 }} role="presentation" onClick={() => setDrawerOpen(false)}>
          <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AdjustIcon sx={{ color: 'primary.main' }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {league?.season ?? ''}
            </Typography>
          </Box>
          <List>
            {navItems.map((item) => (
              <ListItem key={item.to} disablePadding>
                <ListItemButton component={NavLink} to={item.to}>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>
      </Drawer>

      <Container component="main" maxWidth="lg" sx={{ py: 4, flexGrow: 1 }}>
        <Outlet />
      </Container>

      <Box
        component="footer"
        sx={{ borderTop: 1, borderColor: 'divider', py: 2, textAlign: 'center' }}
      >
        <Typography variant="body2" color="text.secondary">
          {league?.season ?? ''} · {league?.split ?? ''} · Week {league?.currentWeek ?? ''}
        </Typography>
      </Box>
    </Box>
  )
}
