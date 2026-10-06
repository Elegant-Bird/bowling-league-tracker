import { Router, type Request, type Response } from 'express'
import type { BowlerWeekStats } from '@bowling/shared'
import { bowlerStats, stripMongoId } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const bowlerStatsRouter = Router()

bowlerStatsRouter.use(requireAuth)

const NUMERIC_FIELDS = [
  'avg',
  'entAvg',
  'hdcp',
  'gamesPlayed',
  'pins',
  'highGame',
  'highSeries',
] as const

function validateStats(
  body: unknown,
): { stats: BowlerWeekStats } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  if (typeof b.bowlerId !== 'string' || b.bowlerId.trim() === '') {
    return { error: 'bowlerId is required and must be a non-empty string' }
  }
  if (typeof b.week !== 'number' || !Number.isInteger(b.week) || b.week <= 0) {
    return { error: 'week must be a positive integer' }
  }
  for (const key of NUMERIC_FIELDS) {
    const v = b[key]
    if (typeof v !== 'number' || v < 0) {
      return { error: `${key} must be a number >= 0` }
    }
  }

  return {
    stats: {
      bowlerId: b.bowlerId,
      week: b.week,
      avg: b.avg as number,
      entAvg: b.entAvg as number,
      hdcp: b.hdcp as number,
      gamesPlayed: b.gamesPlayed as number,
      pins: b.pins as number,
      highGame: b.highGame as number,
      highSeries: b.highSeries as number,
    },
  }
}

bowlerStatsRouter.post('/', async (req: Request, res: Response) => {
  const result = validateStats(req.body)
  if ('error' in result) {
    res.status(400).json({ error: result.error })
    return
  }

  const existing = await bowlerStats().findOne({
    bowlerId: result.stats.bowlerId,
    week: result.stats.week,
  })
  if (existing) {
    res.status(409).json({
      error: `Stats for bowler "${result.stats.bowlerId}" week ${result.stats.week} already exist`,
    })
    return
  }

  await bowlerStats().insertOne({ ...result.stats })
  res.status(201).json(result.stats)
})

// Update a bowler's stats for a week. The (bowlerId, week) pair is the identity
// key, taken from the URL — never mutated from the body.
bowlerStatsRouter.put('/:bowlerId/:week', async (req: Request, res: Response) => {
  const bowlerId = String(req.params.bowlerId)
  const week = Number(req.params.week)
  if (!Number.isInteger(week) || week <= 0) {
    res.status(400).json({ error: 'week must be a positive integer' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  for (const key of NUMERIC_FIELDS) {
    if (typeof body[key] === 'number') update[key] = body[key]
  }
  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'No valid numeric fields to update' })
    return
  }

  const updated = await bowlerStats().findOneAndUpdate(
    { bowlerId, week },
    { $set: update },
    { returnDocument: 'after' },
  )
  if (!updated) {
    res.status(404).json({ error: 'Bowler stats not found for that week' })
    return
  }
  res.status(200).json(stripMongoId(updated))
})

bowlerStatsRouter.delete('/:bowlerId/:week', async (req: Request, res: Response) => {
  const bowlerId = String(req.params.bowlerId)
  const week = Number(req.params.week)
  if (!Number.isInteger(week) || week <= 0) {
    res.status(400).json({ error: 'week must be a positive integer' })
    return
  }
  const result = await bowlerStats().deleteOne({ bowlerId, week })
  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'Bowler stats not found for that week' })
    return
  }
  res.status(204).end()
})
