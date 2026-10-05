import { Router, type Request, type Response } from 'express'
import type { ScheduledMatch } from '@bowling/shared'
import { schedule, stripMongoId } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const scheduleRouter = Router()

scheduleRouter.use(requireAuth)

function validateSchedule(
  body: unknown,
): { entry: ScheduledMatch } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  if (typeof b.week !== 'number' || !Number.isInteger(b.week) || b.week <= 0) {
    return { error: 'week must be a positive integer' }
  }
  if (typeof b.date !== 'string' || b.date.trim() === '') {
    return { error: 'date is required and must be a non-empty string' }
  }
  if (typeof b.format !== 'string' || b.format.trim() === '') {
    return { error: 'format is required and must be a non-empty string' }
  }

  return { entry: { week: b.week, date: b.date, format: b.format } }
}

scheduleRouter.post('/', async (req: Request, res: Response) => {
  const result = validateSchedule(req.body)
  if ('error' in result) {
    res.status(400).json({ error: result.error })
    return
  }

  const existing = await schedule().findOne({ week: result.entry.week })
  if (existing) {
    res.status(409).json({ error: `Schedule entry for week ${result.entry.week} already exists` })
    return
  }

  await schedule().insertOne({ ...result.entry })
  res.status(201).json(result.entry)
})

scheduleRouter.put('/:week', async (req: Request, res: Response) => {
  const week = Number(req.params.week)
  if (!Number.isInteger(week) || week <= 0) {
    res.status(400).json({ error: 'week must be a positive integer' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  // week is the identity key — immutable via PUT, never taken from the body.
  if (typeof body.date === 'string') update.date = body.date
  if (typeof body.format === 'string') update.format = body.format

  const updated = await schedule().findOneAndUpdate(
    { week },
    { $set: update },
    { returnDocument: 'after' },
  )
  if (!updated) {
    res.status(404).json({ error: 'Schedule entry not found' })
    return
  }
  res.status(200).json(stripMongoId(updated))
})

scheduleRouter.delete('/:week', async (req: Request, res: Response) => {
  const week = Number(req.params.week)
  if (!Number.isInteger(week) || week <= 0) {
    res.status(400).json({ error: 'week must be a positive integer' })
    return
  }

  const result = await schedule().deleteOne({ week })
  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'Schedule entry not found' })
    return
  }
  res.status(204).end()
})
