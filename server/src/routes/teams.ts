import { Router, type Request, type Response } from 'express'
import type { Team } from '@bowling/shared'
import { teams, stripMongoId } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const teamsRouter = Router()

teamsRouter.use(requireAuth)

function validateTeam(body: unknown): { team: Team } | { error: string } {
  if (typeof body !== 'object' || body === null) {
    return { error: 'Request body must be a JSON object' }
  }
  const b = body as Record<string, unknown>

  if (typeof b.id !== 'string' || b.id.trim() === '') {
    return { error: 'id is required and must be a non-empty string' }
  }
  if (typeof b.number !== 'string') {
    return { error: 'number is required and must be a string' }
  }
  if (typeof b.name !== 'string' || b.name.trim() === '') {
    return { error: 'name is required and must be a non-empty string' }
  }
  if (typeof b.lane !== 'number' || !Number.isInteger(b.lane) || b.lane <= 0) {
    return { error: 'lane must be a positive integer' }
  }
  for (const key of ['won', 'lost', 'teamHdcp', 'teamAvg', 'scratch', 'total']) {
    const v = b[key]
    if (typeof v !== 'number' || v < 0) {
      return { error: `${key} must be a number >= 0` }
    }
  }
  if (
    !Array.isArray(b.bowlerIds) ||
    !b.bowlerIds.every((x) => typeof x === 'string')
  ) {
    return { error: 'bowlerIds must be an array of strings' }
  }

  return {
    team: {
      id: b.id,
      number: b.number,
      name: b.name,
      lane: b.lane,
      won: b.won as number,
      lost: b.lost as number,
      teamHdcp: b.teamHdcp as number,
      teamAvg: b.teamAvg as number,
      scratch: b.scratch as number,
      total: b.total as number,
      bowlerIds: b.bowlerIds as string[],
    },
  }
}

teamsRouter.post('/', async (req: Request, res: Response) => {
  const result = validateTeam(req.body)
  if ('error' in result) {
    res.status(400).json({ error: result.error })
    return
  }

  const existing = await teams().findOne({ id: result.team.id })
  if (existing) {
    res.status(409).json({ error: `Team with id "${result.team.id}" already exists` })
    return
  }

  await teams().insertOne({ ...result.team })
  res.status(201).json(result.team)
})

teamsRouter.put('/:id', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const update: Record<string, unknown> = {}

  // Whitelist of mutable fields only — identity (id/_id) is never taken
  // from the body; the URL param is authoritative.
  if (typeof body.number === 'string') update.number = body.number
  if (typeof body.name === 'string') update.name = body.name
  if (typeof body.lane === 'number') update.lane = body.lane
  for (const key of ['won', 'lost', 'teamHdcp', 'teamAvg', 'scratch', 'total']) {
    if (typeof body[key] === 'number') update[key] = body[key]
  }
  if (
    Array.isArray(body.bowlerIds) &&
    body.bowlerIds.every((x) => typeof x === 'string')
  ) {
    update.bowlerIds = body.bowlerIds
  }

  const updated = await teams().findOneAndUpdate(
    { id: req.params.id },
    { $set: update },
    { returnDocument: 'after' },
  )
  if (!updated) {
    res.status(404).json({ error: 'Team not found' })
    return
  }
  res.status(200).json(stripMongoId(updated))
})

teamsRouter.delete('/:id', async (req: Request, res: Response) => {
  const result = await teams().deleteOne({ id: req.params.id })
  if (result.deletedCount === 0) {
    res.status(404).json({ error: 'Team not found' })
    return
  }
  res.status(204).end()
})
