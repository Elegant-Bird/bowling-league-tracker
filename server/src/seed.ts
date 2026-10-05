import type {
  Bowler,
  Team,
  ScheduledMatch,
  MatchResult,
  Leaderboard,
} from '@bowling/shared'
import { config } from './env.js'
import {
  connectDB,
  closeDB,
  getDb,
  teams as teamsCol,
  bowlers as bowlersCol,
  schedule as scheduleCol,
  results as resultsCol,
  leaderboards as leaderboardsCol,
  leagueMeta as leagueMetaCol,
  bootstrapAdmin,
} from './db.js'

// Seed data copied verbatim from client/src/data/league.ts
// ("2026 Lakers - Week 3 (9/23/26)" report). Typed with @bowling/shared so it
// stays in sync with the frozen domain model. This is the single source of
// truth for the seed dataset.

const bowlers: Bowler[] = [
  // Team 1 (Lane 38)
  { id: 'b-rhonda-thompson', name: 'Rhonda Thompson', gender: 'F', avg: 126, entAvg: 121, hdcp: 74, gamesPlayed: 9, pins: 1139, highGame: 139, highSeries: 395 },
  { id: 'b-robin-robinson', name: 'Robin Robinson', gender: 'F', avg: 140, entAvg: 150, hdcp: 60, gamesPlayed: 9, pins: 1260, highGame: 178, highSeries: 443 },
  { id: 'b-rosalind-holloway', name: 'Rosalind Holloway', gender: 'F', avg: 135, entAvg: 135, hdcp: 65, gamesPlayed: 6, pins: 882, highGame: 191, highSeries: 481 },

  // Team 2 (Lane 35)
  { id: 'b-bernice-chase', name: 'Bernice Chase', gender: 'F', avg: 141, entAvg: 141, hdcp: 59, gamesPlayed: 9, pins: 1277, highGame: 167, highSeries: 440 },
  { id: 'b-larke-camp', name: 'Larke Camp', gender: 'M', avg: 131, entAvg: 131, hdcp: 69, gamesPlayed: 3, pins: 346, highGame: 143, highSeries: 346 },
  { id: 'b-freeman-camp', name: 'Freeman Camp', gender: 'M', avg: 122, entAvg: 0, hdcp: 78, gamesPlayed: 3, pins: 367, highGame: 148, highSeries: 367 },

  // Team 3 (Lane 39)
  { id: 'b-synethia-parker', name: 'Synethia Parker', gender: 'F', avg: 116, entAvg: 125, hdcp: 84, gamesPlayed: 9, pins: 1048, highGame: 145, highSeries: 403 },
  { id: 'b-vacant-t3', name: 'Vacant', gender: 'F', avg: 114, entAvg: 114, hdcp: 86, gamesPlayed: 0, pins: 0, highGame: 0, highSeries: 0, vacant: true },
  { id: 'b-bettie-thomas-wright', name: 'Bettie Thomas-wright', gender: 'F', avg: 124, entAvg: 116, hdcp: 76, gamesPlayed: 9, pins: 1117, highGame: 174, highSeries: 405 },

  // Team 4 (Lane 37)
  { id: 'b-sadie-henriques', name: 'Sadie Henriques', gender: 'F', avg: 118, entAvg: 112, hdcp: 82, gamesPlayed: 9, pins: 1063, highGame: 144, highSeries: 392 },
  { id: 'b-joyce-smith', name: 'Joyce Smith', gender: 'F', avg: 132, entAvg: 132, hdcp: 68, gamesPlayed: 6, pins: 899, highGame: 191, highSeries: 489 },
  { id: 'b-cappy-boyce', name: 'Cappy Boyce', gender: 'F', avg: 135, entAvg: 135, hdcp: 65, gamesPlayed: 3, pins: 414, highGame: 146, highSeries: 414 },

  // THE LIONS (Lane 40)
  { id: 'b-rogers-elebra', name: 'Rogers Elebra', gender: 'M', avg: 109, entAvg: 99, hdcp: 91, gamesPlayed: 9, pins: 987, highGame: 134, highSeries: 353 },
  { id: 'b-cassie-elebra', name: 'Cassie Elebra', gender: 'F', avg: 130, entAvg: 128, hdcp: 70, gamesPlayed: 9, pins: 1172, highGame: 152, highSeries: 407 },
  { id: 'b-vacant-lions', name: 'Vacant', gender: 'F', avg: 114, entAvg: 114, hdcp: 86, gamesPlayed: 0, pins: 0, highGame: 0, highSeries: 0, vacant: true },

  // NO STRINGS ATTACHED (Lane 36)
  { id: 'b-sherice-loiseau', name: 'Sherice Loiseau', gender: 'F', avg: 105, entAvg: 105, hdcp: 95, gamesPlayed: 6, pins: 672, highGame: 117, highSeries: 341 },
  { id: 'b-natasha-loiseau', name: 'Natasha Loiseau', gender: 'F', avg: 115, entAvg: 115, hdcp: 85, gamesPlayed: 6, pins: 841, highGame: 182, highSeries: 433 },
  { id: 'b-vacant-nsa', name: 'Vacant', gender: 'F', avg: 114, entAvg: 114, hdcp: 86, gamesPlayed: 0, pins: 0, highGame: 0, highSeries: 0, vacant: true },
]

const teams: Team[] = [
  { id: 't-4', number: '4', name: 'Team 4', lane: 37, won: 9, lost: 3, teamHdcp: 16, teamAvg: 385, scratch: 3402, total: 3402, bowlerIds: ['b-sadie-henriques', 'b-joyce-smith', 'b-cappy-boyce'] },
  { id: 't-1', number: '1', name: 'Team 1', lane: 38, won: 7, lost: 5, teamHdcp: 0, teamAvg: 401, scratch: 3623, total: 3623, bowlerIds: ['b-rhonda-thompson', 'b-robin-robinson', 'b-rosalind-holloway'] },
  { id: 't-6', number: '6', name: 'NO STRINGS ATTACHED', lane: 36, won: 5, lost: 7, teamHdcp: 60, teamAvg: 334, scratch: 3139, total: 3511, bowlerIds: ['b-sherice-loiseau', 'b-natasha-loiseau', 'b-vacant-nsa'] },
  { id: 't-2', number: '2', name: 'Team 2', lane: 35, won: 5, lost: 7, teamHdcp: 0, teamAvg: 394, scratch: 3358, total: 3406, bowlerIds: ['b-bernice-chase', 'b-larke-camp', 'b-freeman-camp'] },
  { id: 't-5', number: '5', name: 'THE LIONS', lane: 40, won: 5, lost: 7, teamHdcp: 1, teamAvg: 353, scratch: 3185, total: 3395, bowlerIds: ['b-rogers-elebra', 'b-cassie-elebra', 'b-vacant-lions'] },
  { id: 't-3', number: '3', name: 'Team 3', lane: 39, won: 3, lost: 9, teamHdcp: 0, teamAvg: 354, scratch: 3191, total: 3395, bowlerIds: ['b-synethia-parker', 'b-vacant-t3', 'b-bettie-thomas-wright'] },
]

const schedule: ScheduledMatch[] = [
  { week: 4, date: '2026-09-30', format: 'Normal' },
  { week: 5, date: '2026-10-07', format: 'Normal' },
  { week: 6, date: '2026-10-14', format: 'Normal' },
]

const lastWeekResults: MatchResult[] = [
  {
    week: 2,
    lanes: '35-36',
    homeTeamId: 't-3',
    awayTeamId: 't-1',
    homeGames: [401, 430],
    homeSeries: 1226,
    awayGames: [392],
    awaySeries: 0,
    homePoints: 1,
    awayPoints: 0,
  },
  {
    week: 2,
    lanes: '37-38',
    homeTeamId: 't-2',
    awayTeamId: 't-5',
    homeGames: [385, 376],
    homeSeries: 1153,
    awayGames: [384],
    awaySeries: 0,
    homePoints: 1,
    awayPoints: 0,
  },
  {
    week: 2,
    lanes: '39-40',
    homeTeamId: 't-6',
    awayTeamId: 't-4',
    homeGames: [359, 359],
    homeSeries: 1065,
    awayGames: [336],
    awaySeries: 0,
    homePoints: 0,
    awayPoints: 1,
  },
]

const leaderboards: Leaderboard[] = [
  {
    title: 'High Average',
    group: 'Male',
    entries: [{ rank: 1, bowlerName: 'Rogers Elebra', value: 109.67 }],
  },
  {
    title: 'High Average',
    group: 'Female',
    entries: [
      { rank: 1, bowlerName: 'Bernice Chase', value: 141.89 },
      { rank: 2, bowlerName: 'Robin Robinson', value: 140 },
      { rank: 3, bowlerName: 'Cassie Elebra', value: 130.22 },
      { rank: 4, bowlerName: 'Rhonda Thompson', value: 126.56 },
      { rank: 5, bowlerName: 'Bettie Thomas-wright', value: 124.11 },
    ],
  },
  {
    title: 'High Series Scratch',
    group: 'Female',
    entries: [
      { rank: 1, bowlerName: 'Robin Robinson', value: 443 },
      { rank: 2, bowlerName: 'Bernice Chase', value: 440 },
      { rank: 3, bowlerName: 'Cassie Elebra', value: 407 },
      { rank: 4, bowlerName: 'Bettie Thomas-wright', value: 405 },
      { rank: 5, bowlerName: 'Synethia Parker', value: 403 },
    ],
  },
  {
    title: 'High Series Handicap',
    group: 'Team',
    entries: [
      { rank: 1, teamName: 'NO STRINGS ATTACHED', value: 1307 },
      { rank: 2, teamName: 'Team 1', value: 1270 },
      { rank: 3, teamName: 'THE LIONS', value: 1253 },
      { rank: 4, teamName: 'Team 3', value: 1226 },
      { rank: 5, teamName: 'Team 4', value: 1223 },
    ],
  },
]

const meta = {
  season: '2026 Lakers',
  currentWeek: 3,
  currentWeekDate: '2026-09-23',
  split: 'Split 1 (Weeks 1 - 16)',
}

async function seed(): Promise<void> {
  await connectDB(config.mongoUri)
  const db = getDb()

  // Drop the seven seeded collections for a fully idempotent reseed.
  for (const name of [
    'league_meta',
    'teams',
    'bowlers',
    'schedule',
    'results',
    'leaderboards',
    'admins',
  ]) {
    await db
      .collection(name)
      .drop()
      .catch(() => {
        // Collection may not exist yet — ignore.
      })
  }

  await leagueMetaCol().insertOne({ ...meta })
  await teamsCol().insertMany(teams.map((t) => ({ ...t })))
  await bowlersCol().insertMany(bowlers.map((b) => ({ ...b })))
  await scheduleCol().insertMany(schedule.map((s) => ({ ...s })))
  await resultsCol().insertMany(lastWeekResults.map((r) => ({ ...r })))
  await leaderboardsCol().insertMany(leaderboards.map((l) => ({ ...l })), {
    ordered: true,
  })

  await bootstrapAdmin()

  console.log(
    `Seeded: 1 league_meta, ${teams.length} teams, ${bowlers.length} bowlers, ` +
      `${schedule.length} schedule, ${lastWeekResults.length} results, ` +
      `${leaderboards.length} leaderboards.`,
  )

  await closeDB()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : 'unknown')
  process.exit(1)
})
