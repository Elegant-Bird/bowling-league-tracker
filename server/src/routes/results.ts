import { Router, type Request, type Response } from 'express'
import { ObjectId } from 'mongodb'
import type { MatchResult } from '@bowling/shared'
import { results, stripMongoId } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const resultsRouter = Router()

resultsRouter.use(requireAuth)

function isNumberArrayGteZero(v: unknown): v is number[] {
  return (
    Array.isArray(v) && v.every((n) => typeof n === 'number' && n >= 0)
  )
}

function validateResult(
  body: unknown,
): { result: MatchResult } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  if (typeof b.week !== 'number' || !Number.isInteger(b.week) || b.week <= 0) {
    return { error: 'week must be a positive integer' }
  }
  if (typeof b.lanes !== 'string' || b.lanes.trim() === '') {
    return { error: 'lanes must be a non-empty string' }
  }
  if (typeof b.homeTeamId !== 'string' || b.homeTeamId.trim() === '') {
    return { error: 'homeTeamId must be a non-empty string' }
  }
  if (typeof b.awayTeamId !== 'string' || b.awayTeamId.trim() === '') {
    return { error: 'awayTeamId must be a non-empty string' }
  }
  // Arrays of numbers >= 0; MAY be empty and MAY differ in length.
  if (!isNumberArrayGteZero(b.homeGames)) {
    return { error: 'homeGames must be an array of numbers >= 0' }
  }
  if (!isNumberArrayGteZero(b.awayGames)) {
    return { error: 'awayGames must be an array of numbers >= 0' }
  }
  // Series totals are independent of listed games — NOT required to equal sums.
  for (const key of ['homeSeries', 'awaySeries', 'homePoints', 'awayPoints']) {
    const v = b[key]
    if (typeof v !== 'number' || v < 0) {
      return { error: `${key} must be a number >= 0` }
    }
  }

  return {
    result: {
      week: b.week,
      lanes: b.lanes,
      homeTeamId: b.homeTeamId,
      awayTeamId: b.awayTeamId,
      homeGames: b.homeGames,
      homeSeries: b.homeSeries as number,
      awayGames: b.awayGames,
      awaySeries: b.awaySeries as number,
      homePoints: b.homePoints as number,
      awayPoints: b.awayPoints as number,
    },
  }
}

resultsRouter.post('/', async (req: Request, res: Response) => {
  const validated = validateResult(req.body)
  if ('error' in validated) {
    res.status(400).json({ error: validated.error })
    return
  }

  await results().insertOne({ ...validated.result })
  res.status(201).json(validated.result)
})

resultsRouter.put('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id)
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid result id' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}

  // Whitelist of mutable fields; _id (identity) is never taken from the body.
  if (typeof body.week === 'number') update.week = body.week
  if (typeof body.lanes === 'string') update.lanes = body.lanes
  if (typeof body.homeTeamId === 'string') update.homeTeamId = body.homeTeamId
  if (typeof body.awayTeamId === 'string') update.awayTeamId = body.awayTeamId
  if (isNumberArrayGteZero(body.homeGames)) update.homeGames = body.homeGames
  if (isNumberArrayGteZero(body.awayGames)) update.awayGames = body.awayGames
  for (const key of ['homeSeries', 'awaySeries', 'homePoints', 'awayPoints']) {
    if (typeof body[key] === 'number') update[key] = body[key]
  }

  const updated = await results().findOneAndUpdate(
    { _id: new ObjectId(id) },
    { $set: update },
    { returnDocument: 'after' },
  )
  if (!updated) {
    res.status(404).json({ error: 'Result not found' })
    return
  }
  res.status(200).json(stripMongoId(updated))
})

resultsRouter.delete('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id)
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid result id' })
    return
  }

  const result = await results().deleteOne({ _id: new ObjectId(id) })
  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'Result not found' })
    return
  }
  res.status(204).end()
})
