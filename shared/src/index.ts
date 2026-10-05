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
/** A single lane and the team assigned to bowl on it for a given week. */
export interface LaneAssignment {
  lane: number // e.g. 35
  teamId: string // internal team id, e.g. "t-2"
}

export interface ScheduledMatch {
  week: number
  date: string // ISO date, e.g. "2026-09-30"
  format: string // e.g. "Normal"
  /**
   * Team on each lane this week, ordered by lane ascending. Adjacent lane
   * pairs (35-36, 37-38, 39-40) face each other, so the head-to-head
   * matchups are derived by grouping this list two at a time.
   */
  lanes: LaneAssignment[]
}

/**
 * Result of a match between two teams in a given week. Each match is 3 games
 * on a pair of adjacent lanes. Four points are available: one for each of the
 * 3 games (higher game score wins the point) and one for the series total.
 * A tie on any point splits it half-and-half, so every match distributes
 * exactly 4 points. "home"/"away" are just the two sides on the lane pair —
 * the league has no real home/away concept.
 */
export interface MatchResult {
  /** Stable id (the Mongo _id as a string), present on fetched results so
   *  they can be targeted for edit/delete. Omitted when creating. */
  id?: string
  week: number
  lanes: string // e.g. "35-36"
  homeTeamId: string
  awayTeamId: string
  homeGames: number[] // the 3 individual game scores
  homeSeries: number // total across the 3 games
  awayGames: number[]
  awaySeries: number
  /** Points won in this match (games won + series; halves on ties). */
  homePoints: number
  awayPoints: number
  /**
   * True when that side was absent this week and bowled vacant/absent scores
   * (their average + handicap) instead of real games. Scoring still counts
   * normally; this flag is only for display.
   */
  homeAbsent?: boolean
  awayAbsent?: boolean
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

// --- Scoring ---------------------------------------------------------------

/** Who won a single comparison (one game or the series total). */
export type PointWinner = 'home' | 'away' | 'tie'

/** The outcome of one game within a match. */
export interface GameOutcome {
  /** 0-based game index. */
  index: number
  homeScore: number
  awayScore: number
  winner: PointWinner
}

/** Fully derived scoring breakdown for a match. */
export interface MatchScoring {
  games: GameOutcome[]
  seriesWinner: PointWinner
  /** Points for each side (games won + series; 0.5 each on a tie). */
  homePoints: number
  awayPoints: number
}

/** Compare two scores into a PointWinner. */
function comparePoint(home: number, away: number): PointWinner {
  if (home > away) return 'home'
  if (away > home) return 'away'
  return 'tie'
}

/** Award points for one comparison: 1 to the winner, or 0.5 each on a tie. */
function pointShare(winner: PointWinner): { home: number; away: number } {
  if (winner === 'home') return { home: 1, away: 0 }
  if (winner === 'away') return { home: 0, away: 1 }
  return { home: 0.5, away: 0.5 }
}

/**
 * Derive the per-game winners, series winner, and point totals for a match
 * directly from its game scores. Four points total: one per game plus one for
 * the series, with ties split half-and-half. Only games present on BOTH sides
 * are scored (guards against mismatched/short arrays).
 *
 * This computes points from the game data; a stored MatchResult also carries
 * homePoints/awayPoints as the authoritative recorded result. Use
 * `computeMatchScoring` for display highlighting and to cross-check stored
 * points against the games.
 */
export function computeMatchScoring(match: MatchResult): MatchScoring {
  const gameCount = Math.min(match.homeGames.length, match.awayGames.length)
  const games: GameOutcome[] = []
  let homePoints = 0
  let awayPoints = 0

  for (let i = 0; i < gameCount; i++) {
    const homeScore = match.homeGames[i]
    const awayScore = match.awayGames[i]
    const winner = comparePoint(homeScore, awayScore)
    const share = pointShare(winner)
    homePoints += share.home
    awayPoints += share.away
    games.push({ index: i, homeScore, awayScore, winner })
  }

  const seriesWinner = comparePoint(match.homeSeries, match.awaySeries)
  const seriesShare = pointShare(seriesWinner)
  homePoints += seriesShare.home
  awayPoints += seriesShare.away

  return { games, seriesWinner, homePoints, awayPoints }
}

// League rules & FAQ content.
export * from './rules.js'
