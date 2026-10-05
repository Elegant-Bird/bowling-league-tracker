// Shared domain model for the bowling league app.
// Imported by both the API server and the React client so the two
// stay in sync. Derived from the 2026 Lakers league report
// (standings, schedule, weekly scores, leaderboards, and bowler roster).

export type Gender = 'M' | 'F'

/** A single person on a team's roster. */
export interface Bowler {
  id: string
  name: string
  gender: Gender
  /** Current average. */
  avg: number
  /** Entering average (season start). */
  entAvg: number
  /** Handicap. */
  hdcp: number
  gamesPlayed: number
  pins: number
  highGame: number
  highSeries: number
  /** A placeholder/vacant roster slot rather than a real person. */
  vacant?: boolean
}

/** A team and its roster. */
export interface Team {
  id: string
  /** Team number as shown in the report (e.g. "4"). */
  number: string
  name: string
  lane: number
  /** Win/loss record for the season so far. */
  won: number
  lost: number
  teamHdcp: number
  teamAvg: number
  scratch: number
  total: number
  bowlerIds: string[]
}

/** One scheduled match-up for a given week. */
export interface ScheduledMatch {
  week: number
  date: string // ISO date, e.g. "2026-09-30"
  /** Lane -> opponent lane position mapping as printed in the schedule. */
  format: string // e.g. "Normal"
}

/** Result of a head-to-head team match in a given week. */
export interface MatchResult {
  week: number
  lanes: string // e.g. "35-36"
  homeTeamId: string
  awayTeamId: string
  homeGames: number[] // individual game totals
  homeSeries: number
  awayGames: number[]
  awaySeries: number
  /** Points won by the home team in this match. */
  homePoints: number
  awayPoints: number
}

export interface LeaderboardEntry {
  rank: number
  bowlerName?: string
  teamName?: string
  value: number | string
}

/** A named leaderboard category (e.g. "High Average - Female"). */
export interface Leaderboard {
  title: string
  group: 'Male' | 'Female' | 'Team'
  entries: LeaderboardEntry[]
}

/** Top-level league document. */
export interface League {
  season: string // "2026 Lakers"
  currentWeek: number
  currentWeekDate: string
  split: string // "Split 1 (Weeks 1 - 16)"
  teams: Team[]
  bowlers: Bowler[]
  schedule: ScheduledMatch[]
  lastWeekResults: MatchResult[]
  leaderboards: Leaderboard[]
}

/** Metadata for a stored weekly PDF report (the file lives in GridFS). */
export interface WeeklyReport {
  id: string
  season: string
  week: number
  /** Date the report covers, ISO (e.g. "2026-09-23"). */
  date: string
  /** Original uploaded filename. */
  filename: string
  contentType: string
  sizeBytes: number
  uploadedAt: string // ISO timestamp
}

/** Public shape of an authenticated admin user (never includes the hash). */
export interface AdminUser {
  username: string
}

export interface LoginResponse {
  token: string
  user: AdminUser
}
