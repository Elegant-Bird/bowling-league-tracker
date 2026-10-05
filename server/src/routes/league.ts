import { Router, type Request, type Response } from 'express'
import type { League } from '@bowling/shared'
import {
  leagueMeta,
  teams,
  bowlers,
  schedule,
  results,
  leaderboards,
  stripMongoId,
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

  return {
    season: meta.season,
    currentWeek: meta.currentWeek,
    currentWeekDate: meta.currentWeekDate,
    split: meta.split,
    teams: allTeams.map(stripMongoId),
    bowlers: allBowlers.map(stripMongoId),
    schedule: allSchedule.map(stripMongoId),
    lastWeekResults: allResults.map(stripMongoId),
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

leagueRouter.get('/schedule', async (_req: Request, res: Response) => {
  const all = await schedule().find({}).sort({ week: 1 }).toArray()
  res.status(200).json(all.map(stripMongoId))
})

leagueRouter.get('/results', async (_req: Request, res: Response) => {
  const all = await results().find({}).toArray()
  res.status(200).json(all.map(stripMongoId))
})

leagueRouter.get('/leaderboards', async (_req: Request, res: Response) => {
  // NO .sort() — insertion order is the authoritative display order.
  const all = await leaderboards().find({}).toArray()
  res.status(200).json(all.map(stripMongoId))
})
