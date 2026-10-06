import { MongoClient, ObjectId, GridFSBucket, type Collection, type Db } from 'mongodb'
import bcrypt from 'bcryptjs'
import type {
  Bowler,
  Team,
  ScheduledMatch,
  MatchResult,
  Leaderboard,
  WeeklyReport,
  WeekInfo,
  BowlerWeekStats,
} from '@bowling/shared'
import { config } from './env.js'

// Mongo document types — add _id, keep the domain id as a plain string field.
export type TeamDoc = Team & { _id?: ObjectId }
export type BowlerDoc = Bowler & { _id?: ObjectId }
export type BowlerStatsDoc = BowlerWeekStats & { _id?: ObjectId }
export type ScheduleDoc = ScheduledMatch & { _id?: ObjectId }
export type ResultDoc = MatchResult & { _id?: ObjectId }
export type LeaderboardDoc = Leaderboard & { _id?: ObjectId }
export type WeekDoc = WeekInfo & { _id?: ObjectId }
export type AdminDoc = { _id?: ObjectId; username: string; passwordHash: string }
export type ReportMetaDoc = Omit<WeeklyReport, 'id'> & {
  _id?: ObjectId
  gridFsFileId: ObjectId
}

export interface LeagueMetaDoc {
  _id?: ObjectId
  season: string
  currentWeek: number
  currentWeekDate: string
  startWeekDate: string
  split: string
}

let client: MongoClient | null = null

export async function connectDB(uri: string): Promise<void> {
  client = new MongoClient(uri)
  await client.connect()
  await client.db(config.dbName).command({ ping: 1 })
}

export function getDb(): Db {
  if (!client) throw new Error('Database not connected. Call connectDB first.')
  return client.db(config.dbName)
}

export async function closeDB(): Promise<void> {
  if (client) {
    await client.close()
    client = null
  }
}

export function teams(): Collection<TeamDoc> {
  return getDb().collection<TeamDoc>('teams')
}
export function bowlers(): Collection<BowlerDoc> {
  return getDb().collection<BowlerDoc>('bowlers')
}
export function bowlerStats(): Collection<BowlerStatsDoc> {
  return getDb().collection<BowlerStatsDoc>('bowler_stats')
}
export function schedule(): Collection<ScheduleDoc> {
  return getDb().collection<ScheduleDoc>('schedule')
}
export function results(): Collection<ResultDoc> {
  return getDb().collection<ResultDoc>('results')
}
export function leaderboards(): Collection<LeaderboardDoc> {
  return getDb().collection<LeaderboardDoc>('leaderboards')
}
export function admins(): Collection<AdminDoc> {
  return getDb().collection<AdminDoc>('admins')
}
export function leagueMeta(): Collection<LeagueMetaDoc> {
  return getDb().collection<LeagueMetaDoc>('league_meta')
}
export function weeks(): Collection<WeekDoc> {
  return getDb().collection<WeekDoc>('weeks')
}
export function reportsMeta(): Collection<ReportMetaDoc> {
  return getDb().collection<ReportMetaDoc>('reports_meta')
}
export function getReportsBucket(): GridFSBucket {
  return new GridFSBucket(getDb(), { bucketName: 'reports' })
}

/** Removes the internal Mongo _id from a document, returning the domain shape. */
export function stripMongoId<T extends { _id?: ObjectId }>({
  _id,
  ...rest
}: T): Omit<T, '_id'> {
  return rest
}

/**
 * Like stripMongoId but surfaces the _id as a string `id` field. Used for
 * results, which have no domain id of their own but must be addressable by the
 * client for edit/delete.
 */
export function withStringId<T extends { _id?: ObjectId }>({
  _id,
  ...rest
}: T): Omit<T, '_id'> & { id?: string } {
  return _id ? { ...rest, id: _id.toHexString() } : rest
}

/**
 * Idempotent admin bootstrap — inserts the admin from ADMIN_USERNAME /
 * ADMIN_PASSWORD (bcrypt cost 12) only if no admin with that username exists.
 */
export async function bootstrapAdmin(): Promise<void> {
  const existing = await admins().findOne({ username: config.adminUsername })
  if (!existing) {
    const passwordHash = await bcrypt.hash(config.adminPassword, 12)
    await admins().insertOne({ username: config.adminUsername, passwordHash })
    console.log(`Admin user "${config.adminUsername}" created.`)
  }
}

/** Idempotent — createIndex is a no-op when the index already exists. */
export async function ensureIndexes(): Promise<void> {
  await teams().createIndex({ id: 1 }, { unique: true })
  await bowlers().createIndex({ id: 1 }, { unique: true })
  await bowlerStats().createIndex({ bowlerId: 1, week: 1 }, { unique: true })
  await schedule().createIndex({ week: 1 }, { unique: true })
  await admins().createIndex({ username: 1 }, { unique: true })
  await weeks().createIndex({ week: 1 }, { unique: true })
}
