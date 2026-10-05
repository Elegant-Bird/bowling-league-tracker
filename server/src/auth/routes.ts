import { Router, type Request, type Response } from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import type { AdminUser, LoginResponse } from '@bowling/shared'
import { admins } from '../db.js'
import { config } from '../env.js'
import { requireAuth } from './middleware.js'

export const authRouter = Router()

authRouter.post('/login', async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {}

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.trim() === '' ||
    password.trim() === ''
  ) {
    res.status(400).json({ error: 'Username and password are required' })
    return
  }

  const admin = await admins().findOne({ username })
  if (!admin) {
    // Identical message for unknown user and bad password (no enumeration).
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const ok = await bcrypt.compare(password, admin.passwordHash)
  if (!ok) {
    res.status(401).json({ error: 'Invalid credentials' })
    return
  }

  const token = jwt.sign({ sub: username }, config.jwtSecret, { expiresIn: '7d' })
  const response: LoginResponse = { token, user: { username } }
  res.status(200).json(response)
})

authRouter.get('/me', requireAuth, (req: Request, res: Response) => {
  const user: AdminUser = { username: req.user!.username }
  res.status(200).json(user)
})
