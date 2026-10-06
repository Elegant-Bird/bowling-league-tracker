import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import type {
  Bowler,
  Team,
  ScheduledMatch,
  MatchResult,
  Leaderboard,
  WeekInfo,
  BowlerWeekStats,
} from '@bowling/shared'
import { config } from './env.js'
import {
  connectDB,
  closeDB,
  getDb,
  teams as teamsCol,
  bowlers as bowlersCol,
  bowlerStats as bowlerStatsCol,
  schedule as scheduleCol,
  results as resultsCol,
  leaderboards as leaderboardsCol,
  leagueMeta as leagueMetaCol,
  weeks as weeksCol,
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
    startWeekDate: string
    split: string
  }
  bowlers: Bowler[]
  bowlerStats?: BowlerWeekStats[]
  teams: Team[]
  schedule: ScheduledMatch[]
  results: MatchResult[]
  leaderboards: Leaderboard[]
  /** Week -> date map. Optional: derived from results when absent. */
  weeks?: WeekInfo[]
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

// Upsert every doc in `rows` into `col` by a natural key, so reseeding updates
// seeded records in place and NEVER deletes data added through the app.
async function upsertAll<T extends object>(
  col: { updateOne: (f: object, u: object, o: object) => Promise<unknown> },
  rows: T[],
  key: (row: T) => Record<string, unknown>,
): Promise<void> {
  for (const row of rows) {
    await col.updateOne(key(row), { $set: { ...row } }, { upsert: true })
  }
}

async function seed(): Promise<void> {
  const { data, source } = loadSeedData()

  // Destructive full rebuild only when explicitly requested with --reset.
  // Default behavior is a safe, non-destructive upsert that preserves any
  // data entered through the admin UI.
  const reset = process.argv.includes('--reset')
  console.log(
    `Seeding from ${source} (${reset ? 'RESET: drop + reinsert' : 'safe upsert, no deletes'}).`,
  )

  await connectDB(config.mongoUri)
  const db = getDb()

  if (reset) {
    for (const name of [
      'league_meta',
      'teams',
      'bowlers',
      'bowler_stats',
      'schedule',
      'results',
      'leaderboards',
      'admins',
      'weeks',
    ]) {
      await db
        .collection(name)
        .drop()
        .catch(() => {
          // Collection may not exist yet — ignore.
        })
    }
  }

  const statRows = data.bowlerStats ?? []

  // Weeks: explicit entries from the JSON, else one (dateless) entry per
  // distinct result week so the collection stays consistent.
  const weekEntries: WeekInfo[] =
    data.weeks && data.weeks.length > 0
      ? data.weeks
      : [...new Set(data.results.map((r) => r.week))]
          .sort((a, b) => a - b)
          .map((week) => ({ week, date: '' }))

  // league_meta is a singleton: upsert the one doc.
  await leagueMetaCol().updateOne({}, { $set: { ...data.meta } }, { upsert: true })

  // Natural keys per collection — results keyed by (week, lanes), stats by
  // (bowlerId, week), leaderboards by (title, group), the rest by their id/week.
  await upsertAll(teamsCol(), data.teams, (t) => ({ id: t.id }))
  await upsertAll(bowlersCol(), data.bowlers, (b) => ({ id: b.id }))
  await upsertAll(bowlerStatsCol(), statRows, (s) => ({ bowlerId: s.bowlerId, week: s.week }))
  await upsertAll(scheduleCol(), data.schedule, (s) => ({ week: s.week }))
  await upsertAll(resultsCol(), data.results, (r) => ({ week: r.week, lanes: r.lanes }))
  await upsertAll(leaderboardsCol(), data.leaderboards, (l) => ({ title: l.title, group: l.group }))
  await upsertAll(weeksCol(), weekEntries, (w) => ({ week: w.week }))

  await bootstrapAdmin()

  console.log(
    `Seeded (upsert): 1 league_meta, ${data.teams.length} teams, ${data.bowlers.length} bowlers, ` +
      `${statRows.length} bowler-stats, ${data.schedule.length} schedule, ` +
      `${data.results.length} results, ${data.leaderboards.length} leaderboards, ` +
      `${weekEntries.length} weeks.`,
  )

  await closeDB()
  process.exit(0)
}

seed().catch((err) => {
  console.error('Seed failed:', err instanceof Error ? err.message : 'unknown')
  process.exit(1)
})
