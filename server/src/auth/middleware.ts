import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../env.js'

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  const parts = header.split(' ')
  if (parts.length !== 2 || parts[0] !== 'Bearer' || !parts[1]) {
    res.status(401).json({ error: 'Invalid token format' })
    return
  }

  try {
    const payload = jwt.verify(parts[1], config.jwtSecret) as { sub?: string }
    if (!payload.sub) {
      res.status(401).json({ error: 'Invalid or expired token' })
      return
    }
    req.user = { username: payload.sub }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
