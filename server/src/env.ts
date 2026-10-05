import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { readFileSync, appendFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import dotenv from 'dotenv'

// atlas-credentials.env lives at the workspace root (one level above server/).
const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(__dirname, '../../atlas-credentials.env')

dotenv.config({ path: ENV_PATH })

export interface ServerConfig {
  mongoUri: string
  dbName: string
  jwtSecret: string
  adminUsername: string
  adminPassword: string
  port: number
}

/**
 * Returns true if the raw env file defines KEY on a non-comment line.
 * A line defines KEY when it matches /^\s*KEY=/ and is not a comment
 * (first non-whitespace char is not '#').
 */
function fileDefinesKey(lines: string[], key: string): boolean {
  const keyRe = new RegExp('^\\s*' + key + '=')
  return lines.some((l) => !/^\s*#/.test(l) && keyRe.test(l))
}

/**
 * Append-if-missing: generate DB_NAME, JWT_SECRET, ADMIN_USERNAME,
 * ADMIN_PASSWORD when absent, writing bare `KEY=value` lines to the env file
 * and setting them on process.env. Existing (possibly quoted) keys are never
 * overwritten or re-quoted. Secret VALUES are never logged — only key names.
 */
function appendMissingKeys(): void {
  const rawLines = existsSync(ENV_PATH)
    ? readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)
    : []

  const defaults: Record<string, () => string> = {
    DB_NAME: () => 'bowling_league',
    JWT_SECRET: () => randomBytes(48).toString('base64url'),
    ADMIN_USERNAME: () => 'admin',
    ADMIN_PASSWORD: () => randomBytes(16).toString('base64url'),
  }

  const toAppend: Array<{ key: string; value: string }> = []

  for (const key of Object.keys(defaults)) {
    // Prefer an already-set process.env value; otherwise fall back to the raw
    // file detection (covers keys present in the file but not loaded for any
    // reason). If neither has it, generate a new value.
    if (process.env[key] !== undefined && process.env[key] !== '') continue
    if (fileDefinesKey(rawLines, key)) continue

    const value = defaults[key]()
    toAppend.push({ key, value })
    process.env[key] = value
  }

  if (toAppend.length === 0) return

  const block = toAppend.map(({ key, value }) => `${key}=${value}`).join('\n')
  try {
    // Leading newline guards against the file not ending in a newline.
    appendFileSync(ENV_PATH, `\n${block}\n`)
  } catch {
    console.error('Could not write generated env vars to atlas-credentials.env')
    process.exit(1)
  }

  console.log(
    `Generated and appended missing env keys: ${toAppend
      .map((e) => e.key)
      .join(', ')}`,
  )
}

function loadConfig(): ServerConfig {
  appendMissingKeys()

  const mongoUri = process.env.MONGODB_URI
  const jwtSecret = process.env.JWT_SECRET

  if (!mongoUri) {
    console.error('Missing required env var: MONGODB_URI')
    process.exit(1)
  }
  if (!jwtSecret) {
    console.error('Missing required env var: JWT_SECRET')
    process.exit(1)
  }

  return {
    // dotenv already strips the surrounding quotes present in the file, so this
    // is the clean connection string. Pass to new MongoClient() verbatim —
    // never re-strip, re-quote, or interpolate credentials.
    mongoUri,
    dbName: process.env.DB_NAME || 'bowling_league',
    jwtSecret,
    adminUsername: process.env.ADMIN_USERNAME || 'admin',
    adminPassword: process.env.ADMIN_PASSWORD || '',
    port: Number(process.env.PORT) || 4000,
  }
}

export const config: ServerConfig = loadConfig()
