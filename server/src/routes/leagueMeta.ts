import { Router, type Request, type Response } from 'express'
import { leagueMeta, stripMongoId } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const leagueMetaRouter = Router()

leagueMetaRouter.use(requireAuth)

leagueMetaRouter.put('/meta', async (req: Request, res: Response) => {
  const b = (req.body ?? {}) as Record<string, unknown>

  if (typeof b.season !== 'string' || b.season.trim() === '') {
    res.status(400).json({ error: 'season is required and must be a non-empty string' })
    return
  }
  if (
    typeof b.currentWeek !== 'number' ||
    !Number.isInteger(b.currentWeek) ||
    b.currentWeek <= 0
  ) {
    res.status(400).json({ error: 'currentWeek must be a positive integer' })
    return
  }
  if (typeof b.currentWeekDate !== 'string' || b.currentWeekDate.trim() === '') {
    res.status(400).json({ error: 'currentWeekDate is required and must be a non-empty string' })
    return
  }
  if (typeof b.split !== 'string' || b.split.trim() === '') {
    res.status(400).json({ error: 'split is required and must be a non-empty string' })
    return
  }

  // Whitelist the persisted document — never write the raw body.
  const doc = {
    season: b.season,
    currentWeek: b.currentWeek,
    currentWeekDate: b.currentWeekDate,
    split: b.split,
  }

  await leagueMeta().replaceOne({}, doc, { upsert: true })
  const updated = await leagueMeta().findOne({})
  res.status(200).json(updated ? stripMongoId(updated) : doc)
})
