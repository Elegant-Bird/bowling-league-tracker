import { Router, type Request, type Response } from 'express'
import type { Bowler, Gender } from '@bowling/shared'
import { bowlers, stripMongoId } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const bowlersRouter = Router()

bowlersRouter.use(requireAuth)

const NUMERIC_FIELDS = [
  'avg',
  'entAvg',
  'hdcp',
  'gamesPlayed',
  'pins',
  'highGame',
  'highSeries',
] as const

function validateBowler(body: unknown): { bowler: Bowler } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  if (typeof b.id !== 'string' || b.id.trim() === '') {
    return { error: 'id is required and must be a non-empty string' }
  }
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    return { error: 'name is required and must be a non-empty string' }
  }
  if (b.gender !== 'M' && b.gender !== 'F') {
    return { error: 'gender must be "M" or "F"' }
  }
  for (const key of NUMERIC_FIELDS) {
    const v = b[key]
    if (typeof v !== 'number' || v < 0) {
      return { error: `${key} must be a number >= 0` }
    }
  }
  if (b.vacant !== undefined && typeof b.vacant !== 'boolean') {
    return { error: 'vacant must be a boolean when present' }
  }

  const bowler: Bowler = {
    id: b.id,
    name: b.name,
    gender: b.gender as Gender,
    avg: b.avg as number,
    entAvg: b.entAvg as number,
    hdcp: b.hdcp as number,
    gamesPlayed: b.gamesPlayed as number,
    pins: b.pins as number,
    highGame: b.highGame as number,
    highSeries: b.highSeries as number,
  }
  if (b.vacant === true) bowler.vacant = true

  return { bowler }
}

bowlersRouter.post('/', async (req: Request, res: Response) => {
  const result = validateBowler(req.body)
  if ('error' in result) {
    res.status(400).json({ error: result.error })
    return
  }

  const existing = await bowlers().findOne({ id: result.bowler.id })
  if (existing) {
    res.status(409).json({ error: `Bowler with id "${result.bowler.id}" already exists` })
    return
  }

  await bowlers().insertOne({ ...result.bowler })
  res.status(201).json(result.bowler)
})

bowlersRouter.put('/:id', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}

  if (typeof body.name === 'string') update.name = body.name
  if (body.gender === 'M' || body.gender === 'F') update.gender = body.gender
  for (const key of NUMERIC_FIELDS) {
    if (typeof body[key] === 'number') update[key] = body[key]
  }
  if (typeof body.vacant === 'boolean') update.vacant = body.vacant

  const updated = await bowlers().findOneAndUpdate(
    { id: req.params.id },
    { $set: update },
    { returnDocument: 'after' },
  )
  if (!updated) {
    res.status(404).json({ error: 'Bowler not found' })
    return
  }
  res.status(200).json(stripMongoId(updated))
})

bowlersRouter.delete('/:id', async (req: Request, res: Response) => {
  const result = await bowlers().deleteOne({ id: req.params.id })
  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'Bowler not found' })
    return
  }
  res.status(204).end()
})
