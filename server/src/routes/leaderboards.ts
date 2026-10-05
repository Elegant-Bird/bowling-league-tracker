import { Router, type Request, type Response } from 'express'
import type { Leaderboard, LeaderboardEntry } from '@bowling/shared'
import { leaderboards, stripMongoId } from '../db.js'
import { requireAuth } from '../auth/middleware.js'

export const leaderboardsRouter = Router()

leaderboardsRouter.use(requireAuth)

const GROUPS = ['Male', 'Female', 'Team'] as const

function validateEntry(v: unknown): LeaderboardEntry | null {
  if (typeof v !== 'object' || v === null) return null
  const e = v as Record<string, unknown>
  if (typeof e.rank !== 'number') return null
  if (e.bowlerName !== undefined && typeof e.bowlerName !== 'string') return null
  if (e.teamName !== undefined && typeof e.teamName !== 'string') return null
  // value must be number | string to match the shared contract.
  if (typeof e.value !== 'number' && typeof e.value !== 'string') return null

  const entry: LeaderboardEntry = { rank: e.rank, value: e.value }
  if (typeof e.bowlerName === 'string') entry.bowlerName = e.bowlerName
  if (typeof e.teamName === 'string') entry.teamName = e.teamName
  return entry
}

function validateLeaderboards(
  body: unknown,
): { boards: Leaderboard[] } | { error: string } {
  if (!Array.isArray(body)) {
    return { error: 'Request body must be an array of leaderboards' }
  }

  const boards: Leaderboard[] = []
  for (const item of body) {
    if (typeof item !== 'object' || item === null) {
      return { error: 'Each leaderboard must be an object' }
    }
    const b = item as Record<string, unknown>
    if (typeof b.title !== 'string' || b.title.trim() === '') {
      return { error: 'Each leaderboard requires a non-empty title' }
    }
    if (!GROUPS.includes(b.group as (typeof GROUPS)[number])) {
      return { error: 'group must be one of "Male", "Female", "Team"' }
    }
    if (!Array.isArray(b.entries)) {
      return { error: 'entries must be an array' }
    }
    const entries: LeaderboardEntry[] = []
    for (const raw of b.entries) {
      const entry = validateEntry(raw)
      if (!entry) {
        return { error: 'Invalid leaderboard entry' }
      }
      entries.push(entry)
    }
    boards.push({
      title: b.title,
      group: b.group as Leaderboard['group'],
      entries,
    })
  }

  return { boards }
}

leaderboardsRouter.put('/', async (req: Request, res: Response) => {
  const validated = validateLeaderboards(req.body)
  if ('error' in validated) {
    res.status(400).json({ error: validated.error })
    return
  }

  // Full replace, preserving insertion order (ordered insertMany).
  await leaderboards().deleteMany({})
  if (validated.boards.length > 0) {
    await leaderboards().insertMany(
      validated.boards.map((b) => ({ ...b })),
      { ordered: true },
    )
  }

  const all = await leaderboards().find({}).toArray()
  res.status(200).json(all.map(stripMongoId))
})
