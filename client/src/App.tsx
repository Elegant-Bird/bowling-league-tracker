import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import StandingsPage from './pages/StandingsPage'
import SchedulePage from './pages/SchedulePage'
import ScoresPage from './pages/ScoresPage'
import TeamsPage from './pages/TeamsPage'
import TeamDetailPage from './pages/TeamDetailPage'
import LeaderboardsPage from './pages/LeaderboardsPage'
import ReportsPage from './pages/ReportsPage'
import RulesPage from './pages/RulesPage'
import LoginPage from './pages/LoginPage'
import NotFoundPage from './pages/NotFoundPage'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/standings" replace />} />
        <Route path="/standings" element={<StandingsPage />} />
        <Route path="/schedule" element={<SchedulePage />} />
        <Route path="/scores" element={<ScoresPage />} />
        <Route path="/teams" element={<TeamsPage />} />
        <Route path="/teams/:teamId" element={<TeamDetailPage />} />
        <Route path="/leaderboards" element={<LeaderboardsPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
