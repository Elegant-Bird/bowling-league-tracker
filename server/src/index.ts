import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import multer from 'multer'
import { config } from './env.js'
import { connectDB, closeDB, ensureIndexes, bootstrapAdmin } from './db.js'
import { authRouter } from './auth/routes.js'
import { healthRouter, leagueRouter } from './routes/league.js'
import { teamsRouter } from './routes/teams.js'
import { bowlersRouter } from './routes/bowlers.js'
import { scheduleRouter } from './routes/schedule.js'
import { resultsRouter } from './routes/results.js'
import { leaderboardsRouter } from './routes/leaderboards.js'
import { leagueMetaRouter } from './routes/leagueMeta.js'
import { reportsRouter } from './routes/reports.js'
import { weeksRouter } from './routes/weeks.js'
import { bowlerStatsRouter } from './routes/bowlerStats.js'

async function main(): Promise<void> {
  await connectDB(config.mongoUri)
  await ensureIndexes()
  await bootstrapAdmin()

  const app = express()
  app.use(cors())
  // Sole JSON parser in the app. multipart/form-data passes through as a no-op.
  app.use(express.json({ limit: '1mb' }))

  app.use('/api', healthRouter)
  app.use('/api/auth', authRouter)
  app.use('/api', leagueRouter)
  app.use('/api/league', leagueMetaRouter)
  app.use('/api/teams', teamsRouter)
  app.use('/api/bowlers', bowlersRouter)
  app.use('/api/schedule', scheduleRouter)
  app.use('/api/results', resultsRouter)
  app.use('/api/leaderboards', leaderboardsRouter)
  app.use('/api/reports', reportsRouter)
  app.use('/api/weeks', weeksRouter)
  app.use('/api/bowler-stats', bowlerStatsRouter)

  // Global error handler. Owns MulterError status mapping; never logs secrets.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(413).json({ error: 'File too large (max 10 MB)' })
        return
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        res.status(400).json({ error: 'Unexpected file field' })
        return
      }
      res.status(400).json({ error: err.message })
      return
    }
    console.error('Unhandled error:', err instanceof Error ? err.message : 'unknown')
    res.status(500).json({ error: 'Internal server error' })
  })

  const server = app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port}`)
  })

  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down.`)
    server.close()
    await closeDB()
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('Fatal startup error:', err instanceof Error ? err.message : 'unknown')
  process.exit(1)
})
