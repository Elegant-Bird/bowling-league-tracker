import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
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

// The seed dataset is loaded from a JSON file at runtime — it is NOT hardcoded
// here. Real league data (with real member names) lives in
// `server/seed-data/league.json`, which is gitignored and never committed.
// A committed `league.example.json` with dummy data documents the schema and
// serves as the fallback so a fresh clone can still seed something runnable.
//
// Source of truth for live data is MongoDB; league.json is a local backup used
// only to (re)populate an empty or fresh cluster.

interface SeedFile {
  meta: {
    season: string
    currentWeek: number
    currentWeekDate: string
    split: string
  }
  bowlers: Bowler[]
  teams: Team[]
  schedule: ScheduledMatch[]
  results: MatchResult[]
  leaderboards: Leaderboard[]
}

const seedDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'seed-data')
const realPath = join(seedDir, 'league.json')
const examplePath = join(seedDir, 'league.example.json')

function loadSeedData(): { data: SeedFile; source: string } {
  const path = existsSync(realPath) ? realPath : examplePath
  if (!existsSync(path)) {
    throw new Error(
      `No seed data found. Expected ${realPath} (real, gitignored) or ` +
        `${examplePath} (committed example).`,
    )
  }
  const raw = readFileSync(path, 'utf8')
  const data = JSON.parse(raw) as SeedFile
  // `league.example.json` carries a leading "_comment" key; it is ignored here.
  return { data, source: path === realPath ? 'league.json' : 'league.example.json (dummy data)' }
}

async function seed(): Promise<void> {
  const { data, source } = loadSeedData()
  console.log(`Seeding from ${source}.`)

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

  await leagueMetaCol().insertOne({ ...data.meta })
  await teamsCol().insertMany(data.teams.map((t) => ({ ...t })))
  await bowlersCol().insertMany(data.bowlers.map((b) => ({ ...b })))
  await scheduleCol().insertMany(data.schedule.map((s) => ({ ...s })))
  await resultsCol().insertMany(data.results.map((r) => ({ ...r })))
  await leaderboardsCol().insertMany(
    data.leaderboards.map((l) => ({ ...l })),
    { ordered: true },
  )

  await bootstrapAdmin()

  console.log(
    `Seeded: 1 league_meta, ${data.teams.length} teams, ${data.bowlers.length} bowlers, ` +
      `${data.schedule.length} schedule, ${data.results.length} results, ` +
      `${data.leaderboards.length} leaderboards.`,
  )

  await closeDB()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : 'unknown')
  process.exit(1)
})
