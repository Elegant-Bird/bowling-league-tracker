import { Router, type Request, type Response } from 'express'
import { weeks, stripMongoId } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const weeksRouter = Router()

weeksRouter.use(requireAuth)

/**
 * Set (or clear) the date for a week. Upserts, since a week may not yet have a
 * doc. `week` is the identity key (from the URL) and is never taken from the
 * body. An empty-string date clears it.
 */
weeksRouter.put('/:week', async (req: Request, res: Response) => {
  const week = Number(req.params.week)
  if (!Number.isInteger(week) || week <= 0) {
    res.status(400).json({ error: 'week must be a positive integer' })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  if (typeof body.date !== 'string') {
    res.status(400).json({ error: 'date is required and must be a string (ISO, e.g. "2026-09-23")' })
    return
  }

  const updated = await weeks().findOneAndUpdate(
    { week },
    { $set: { date: body.date } },
    { upsert: true, returnDocument: 'after' },
  )
  if (!updated) {
    res.status(500).json({ error: 'Failed to upsert week' })
    return
  }
  res.status(200).json(stripMongoId(updated))
})

weeksRouter.delete('/:week', async (req: Request, res: Response) => {
  const week = Number(req.params.week)
  if (!Number.isInteger(week) || week <= 0) {
    res.status(400).json({ error: 'week must be a positive integer' })
    return
  }
  const result = await weeks().deleteOne({ week })
  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'Week not found' })
    return
  }
  res.status(204).end()
})
