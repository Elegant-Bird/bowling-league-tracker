import { Router, type Request, type Response } from 'express'
import type { League, WeekInfo } from '@bowling/shared'
import {
  leagueMeta,
  teams,
  bowlers,
  bowlerStats,
  schedule,
  results,
  leaderboards,
  weeks,
  stripMongoId,
  withStringId,
} from '../db.js'

export const healthRouter = Router()

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' })
})

async function assembleLeague(): Promise<League | null> {
  const [meta, allTeams, allBowlers, allSchedule, allResults, allLeaderboards] =
    await Promise.all([
      leagueMeta().findOne({}),
      teams().find({}).toArray(),
      bowlers().find({}).toArray(),
      schedule().find({}).sort({ week: 1 }).toArray(),
      results().find({}).toArray(),
      // NO .sort() — insertion order is the authoritative display order.
      leaderboards().find({}).toArray(),
    ])

  if (!meta) return null

  // "Last week's scores" = the results for the single most recent week that
  // has any results. Without this scope the page would show every week's
  // results mixed together once more than one week is entered.
  const latestWeek = allResults.reduce(
    (max, r) => (r.week > max ? r.week : max),
    0,
  )
  const latestWeekResults = allResults.filter((r) => r.week === latestWeek)

  return {
    season: meta.season,
    currentWeek: meta.currentWeek,
    currentWeekDate: meta.currentWeekDate,
    split: meta.split,
    teams: allTeams.map(stripMongoId),
    bowlers: allBowlers.map(stripMongoId),
    schedule: allSchedule.map(stripMongoId),
    lastWeekResults: latestWeekResults.map(withStringId),
    leaderboards: allLeaderboards.map(stripMongoId),
  }
}

export const leagueRouter = Router()

leagueRouter.get('/league', async (_req: Request, res: Response) => {
  const league = await assembleLeague()
  if (!league) {
    res.status(503).json({ error: 'League not initialized. Run the seed script.' })
    return
  }
  res.status(200).json(league)
})

leagueRouter.get('/teams', async (_req: Request, res: Response) => {
  const all = await teams().find({}).toArray()
  res.status(200).json(all.map(stripMongoId))
})

leagueRouter.get('/teams/:id', async (req: Request, res: Response) => {
  const doc = await teams().findOne({ id: req.params.id })
  if (!doc) {
    res.status(404).json({ error: 'Team not found' })
    return
  }
  res.status(200).json(stripMongoId(doc))
})

leagueRouter.get('/bowlers', async (_req: Request, res: Response) => {
  const all = await bowlers().find({}).toArray()
  res.status(200).json(all.map(stripMongoId))
})

// One bowler's weekly stat snapshots, ascending by week (for history views).
leagueRouter.get('/bowlers/:id/stats', async (req: Request, res: Response) => {
  const all = await bowlerStats()
    .find({ bowlerId: req.params.id })
    .sort({ week: 1 })
    .toArray()
  res.status(200).json(all.map(stripMongoId))
})

// Weeks that have at least one bowler-stat snapshot, each with its date from
// the weeks collection. Registered before '/bowler-stats' so it isn't shadowed.
leagueRouter.get('/bowler-stats/weeks', async (_req: Request, res: Response) => {
  const [statWeeks, weekDocs] = await Promise.all([
    bowlerStats().distinct('week'),
    weeks().find({}).toArray(),
  ])
  const dateByWeek = new Map<number, string>(weekDocs.map((w) => [w.week, w.date]))
  const out: WeekInfo[] = (statWeeks as number[])
    .sort((a, b) => a - b)
    .map((week) => ({ week, date: dateByWeek.get(week) ?? '' }))
  res.status(200).json(out)
})

// Bowler stat snapshots. Optional ?week=N filter returns just that week's
// snapshots (one per bowler); absent/invalid week returns all.
leagueRouter.get('/bowler-stats', async (req: Request, res: Response) => {
  const weekParam = req.query.week
  const filter: Record<string, unknown> = {}
  if (typeof weekParam === 'string' && weekParam.trim() !== '') {
    const week = Number(weekParam)
    if (!Number.isInteger(week) || week <= 0) {
      res.status(400).json({ error: 'week must be a positive integer' })
      return
    }
    filter.week = week
  }
  const all = await bowlerStats().find(filter).sort({ week: 1 }).toArray()
  res.status(200).json(all.map(stripMongoId))
})

leagueRouter.get('/schedule', async (_req: Request, res: Response) => {
  const all = await schedule().find({}).sort({ week: 1 }).toArray()
  res.status(200).json(all.map(stripMongoId))
})

// Sorted list of weeks that have at least one result, each with its date from
// the normalized `weeks` collection (empty string when no date is recorded).
// Registered before '/results' so it isn't shadowed.
leagueRouter.get('/results/weeks', async (_req: Request, res: Response) => {
  const [resultWeeks, weekDocs] = await Promise.all([
    results().distinct('week'),
    weeks().find({}).toArray(),
  ])
  const dateByWeek = new Map<number, string>(
    weekDocs.map((w) => [w.week, w.date]),
  )
  const out: WeekInfo[] = resultWeeks
    .sort((a: number, b: number) => a - b)
    .map((week) => ({ week, date: dateByWeek.get(week) ?? '' }))
  res.status(200).json(out)
})

leagueRouter.get('/results', async (req: Request, res: Response) => {
  // Optional ?week=N filter. An invalid/absent week returns all results.
  const weekParam = req.query.week
  const filter: Record<string, unknown> = {}
  if (typeof weekParam === 'string' && weekParam.trim() !== '') {
    const week = Number(weekParam)
    if (!Number.isInteger(week) || week <= 0) {
      res.status(400).json({ error: 'week must be a positive integer' })
      return
    }
    filter.week = week
  }
  const all = await results().find(filter).toArray()
  res.status(200).json(all.map(withStringId))
})

leagueRouter.get('/leaderboards', async (_req: Request, res: Response) => {
  // NO .sort() — insertion order is the authoritative display order.
  const all = await leaderboards().find({}).toArray()
  res.status(200).json(all.map(stripMongoId))
})

leagueRouter.get('/weeks', async (_req: Request, res: Response) => {
  const all = await weeks().find({}).sort({ week: 1 }).toArray()
  res.status(200).json(all.map(stripMongoId))
})
