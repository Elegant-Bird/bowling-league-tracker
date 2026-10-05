# Technical Design: Bowling League Backend + Client Migration

## Overview

This design covers building an Express + MongoDB server (`server/`), migrating the React client from hardcoded local data to API-backed data fetching, and adding a PDF reports feature — all within the existing npm-workspaces monorepo. The server exposes public read endpoints that assemble documents from MongoDB collections into the exact `League` shape defined in `@bowling/shared`, JWT-protected write endpoints for admin operations, and GridFS-backed PDF storage. The client gains a centralized data provider, a real auth flow, a Vite dev proxy, and a new Reports page. The `shared/` package is already complete and untouched.

Technology stack (locked): Node 18+, Express 4, official `mongodb` driver v6, `jsonwebtoken`, `bcryptjs`, `multer` (memory storage), `dotenv`, `cors`, `tsx` (dev runner), TypeScript 5, ESM throughout. Client stays on Vite 5, React 18, MUI v9, react-router-dom v6.

### Build Prerequisite: `@bowling/shared` must be built first

The `shared` package's `package.json` resolves `main`/`types`/`exports` to `./dist/index.js` and `./dist/index.d.ts`, but `shared/dist` does not currently exist on disk — the package has never been built. Both the server (`tsc -b` type-check / `tsc -b` build) and the client (Vite + IDE type resolution of `import ... from '@bowling/shared'`) need `shared/dist/index.d.ts` to exist. `tsx` erases type-only imports at runtime so the server *runtime* does not strictly need it, but type-checking and the client build do.

**Verified precondition — `shared/tsconfig.json` is already project-reference-ready.** The locked build order depends on `shared` building cleanly via `tsc -b` both directly (`npm run build --workspace=shared`) and transitively through the server's project reference `{ "path": "../shared" }`. I verified `shared/tsconfig.json` exists and already sets `"composite": true`, `"declaration": true`, `"declarationMap": true`, `"outDir": "./dist"`, and `"rootDir": "./src"` with `"include": ["src"]`. That is exactly what both `tsc -b` entry points require, so no change to `shared/tsconfig.json` is in scope — the premise holds and the predev/build chaining below is sound. If a future change removed `composite`/`declaration` from `shared/tsconfig.json`, both the `shared` build and the server's `tsc -b` reference would break; those two flags are a hard precondition for this build order.

Therefore the build order is locked: **`npm install && npm run build --workspace=shared` must run before `npm run dev` or any type-check.** To make this automatic and not a manual footgun, the root `package.json` is updated so dev always builds shared first. Only `predev` is genuinely new; `dev:server` and `dev:client` already exist verbatim in the current root `package.json` and are unchanged, and `dev` is rewritten to call them:

```jsonc
"scripts": {
  "predev": "npm run build --workspace=shared",   // NEW
  "dev": "npm run dev:server & npm run dev:client", // REWRITTEN (was: npm run dev --workspace=server & npm run dev --workspace=client)
  "dev:server": "npm run dev --workspace=server",   // unchanged (already present)
  "dev:client": "npm run dev --workspace=client",   // unchanged (already present)
  "build": "npm run build --workspace=shared && npm run build --workspace=server && npm run build --workspace=client", // unchanged
  "seed": "npm run seed --workspace=server"         // unchanged
}
```

`predev` runs automatically before `dev` (npm lifecycle) and must complete successfully before the `&`-backgrounded server and client processes start — npm runs the `predev` script to completion first, so `shared/dist` exists before either dev process resolves `@bowling/shared`. The `build` script already chains shared → server → client. Because `seed` runs through `tsx` (type-only imports erased), it does not require `shared/dist`, but running after `build` is harmless. This resolves the gap where the old `dev` script never triggered a shared build.

---

## Server Module Layout

```
server/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts          # Express bootstrap, env validation, CORS, route mounting
│   ├── env.ts            # Load + validate + append env vars
│   ├── db.ts             # MongoClient singleton, typed collection helpers, GridFS bucket
│   ├── auth/
│   │   ├── middleware.ts  # JWT verification middleware
│   │   └── routes.ts     # POST /api/auth/login, GET /api/auth/me
│   ├── routes/
│   │   ├── league.ts     # GET /api/league (assembled), GET /api/health
│   │   ├── teams.ts      # CRUD /api/teams, /api/teams/:id
│   │   ├── bowlers.ts    # CRUD /api/bowlers
│   │   ├── schedule.ts   # CRUD /api/schedule
│   │   ├── results.ts    # CRUD /api/results
│   │   ├── leaderboards.ts # GET /api/leaderboards, PUT /api/leaderboards
│   │   ├── leagueMeta.ts # PUT /api/league/meta
│   │   └── reports.ts    # GridFS PDF endpoints
│   └── seed.ts           # Standalone seed script
```

### package.json

```json
{
  "name": "@bowling/server",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -b",
    "start": "node dist/index.js",
    "seed": "tsx src/seed.ts"
  },
  "dependencies": {
    "@bowling/shared": "*",
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "jsonwebtoken": "^9.0.2",
    "mongodb": "^6.12.0",
    "multer": "^1.4.5-lts.1"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/multer": "^1.4.12",
    "tsx": "^4.19.2",
    "typescript": "^5.6.2"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "composite": true
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

This mirrors the shared tsconfig pattern. The `references` entry ensures `tsc -b` builds shared first when the server is compiled.

---

## Environment Loading Strategy (`src/env.ts`)

The `env.ts` module handles a two-phase environment setup:

1. Load `../atlas-credentials.env` (workspace root) via `dotenv.config({ path: ... })`. This provides `MONGODB_USERNAME`, `MONGODB_PASSWORD`, and `MONGODB_URI`.

   **`MONGODB_URI` is used verbatim — do NOT interpolate credentials.** The provided `MONGODB_URI` is already a complete `mongodb+srv://user:password@host/...` string with the full `user:password@host` userinfo baked in; it contains no `<password>`/`<username>` placeholders and no DB-name path segment. The server passes it directly to `new MongoClient(config.mongoUri)` and supplies the database name separately via `client.db(config.dbName)`. `MONGODB_USERNAME` and `MONGODB_PASSWORD` are present in the file for human reference only — they are **never read by the server and never substituted into the URI**. `ServerConfig` deliberately has no `username`/`password` fields (see below). Attempting the common Atlas pattern of interpolating username/password into a placeholder URI would corrupt *this* URI, since it already carries real credentials. This is a locked decision: the URI authenticates on its own.

2. Check for missing keys that the server needs beyond the Atlas credentials. If any of the following are absent from `process.env` after loading the .env file, append them to the `.env` file and also set them in `process.env`:
   - `DB_NAME` → `"bowling_league"`
   - `JWT_SECRET` → generated via `crypto.randomBytes(48).toString('base64url')` (Node built-in, no extra dep)
   - `ADMIN_USERNAME` → `"admin"`
   - `ADMIN_PASSWORD` → generated via `crypto.randomBytes(16).toString('base64url')`

   **Detection (never overwrite):** read the raw file content once, split into lines, and for each candidate key test whether any line *defines* it. A line defines `KEY` when it matches `^\s*KEY=` after ignoring comment lines (any line whose first non-whitespace character is `#`). Concretely, for key `K` the presence test is: `lines.some(l => !/^\s*#/.test(l) && new RegExp('^\\s*' + K + '=').test(l))`. This avoids false positives on commented examples like `# JWT_SECRET=...` and on indented lines, and it never rewrites or reorders existing keys.

   **Append format:** keys that are missing are collected and appended in a single `fs.appendFileSync` call. Each appended key is written on its own line as bare (unquoted) `KEY=value` — e.g. `\nJWT_SECRET=<base64url>`. Bare is chosen because the generated base64url values and the fixed strings (`bowling_league`, `admin`) contain no spaces or special characters, and `dotenv` reads bare and quoted values identically. A leading `\n` guards against the file not ending in a newline. Existing quoted values in the file (e.g. `MONGODB_USERNAME="elegantbird_db_user"`) are left untouched.

   **Precondition / safety:** `.gitignore` already excludes `*.env`, so writing generated secrets into `atlas-credentials.env` cannot be committed. This gitignore rule is a stated precondition for appending secrets. Secrets are never logged — only key *names* appear in any log line (e.g. "Generated and appended JWT_SECRET, ADMIN_PASSWORD").

   The generated `ADMIN_PASSWORD` location is documented in `server/README.md` (the README says "the default admin password is stored in the root `atlas-credentials.env` file under `ADMIN_PASSWORD`"). The README never contains the Atlas connection password or the generated password value itself.

3. Validate: if `MONGODB_URI` or `JWT_SECRET` is still missing after both phases, throw a clear error with the missing key name and exit. Never log secret values during validation — only log the key names.

The `env.ts` module exports a typed `config` object:

```typescript
export interface ServerConfig {
  mongoUri: string
  dbName: string
  jwtSecret: string
  adminUsername: string
  adminPassword: string
  port: number
}
```

`port` defaults to `Number(process.env.PORT) || 4000`.

Failure mode: if the .env file is missing entirely, `dotenv` silently returns — the validation step then catches the missing `MONGODB_URI` and throws a fatal error. If the file is read-only and append fails, the error is logged with "Could not write generated env vars to atlas-credentials.env" and the process exits. Both are fatal, unrecoverable conditions.

---

## Database Layer (`src/db.ts`)

A single `MongoClient` is created at startup and connected once in `index.ts` before the Express server starts listening. `db.ts` exports:

- `connectDB(uri: string): Promise<void>` — calls `client.connect()`, pings the DB. Fatal if it fails.
- `getDb(): Db` — returns `client.db(config.dbName)`.
- `closeDB(): Promise<void>` — for graceful shutdown (SIGTERM handler in `index.ts`).
- Typed collection accessors using the shared types plus MongoDB `_id`:

```typescript
import type { Bowler, Team, ScheduledMatch, MatchResult, Leaderboard, WeeklyReport } from '@bowling/shared'
import { ObjectId } from 'mongodb'

// Mongo document types — add _id, keep the domain id as a string field
export type TeamDoc = Team & { _id?: ObjectId }
export type BowlerDoc = Bowler & { _id?: ObjectId }
export type ScheduleDoc = ScheduledMatch & { _id?: ObjectId }
export type ResultDoc = MatchResult & { _id?: ObjectId }
export type LeaderboardDoc = Leaderboard & { _id?: ObjectId }
export type AdminDoc = { _id?: ObjectId; username: string; passwordHash: string }
export type ReportMetaDoc = Omit<WeeklyReport, 'id'> & { _id?: ObjectId; gridFsFileId: ObjectId }

export interface LeagueMetaDoc {
  _id?: ObjectId
  season: string
  currentWeek: number
  currentWeekDate: string
  split: string
}

export function teams(): Collection<TeamDoc> { return getDb().collection('teams') }
export function bowlers(): Collection<BowlerDoc> { return getDb().collection('bowlers') }
export function schedule(): Collection<ScheduleDoc> { return getDb().collection('schedule') }
export function results(): Collection<ResultDoc> { return getDb().collection('results') }
export function leaderboards(): Collection<LeaderboardDoc> { return getDb().collection('leaderboards') }
export function admins(): Collection<AdminDoc> { return getDb().collection('admins') }
export function leagueMeta(): Collection<LeagueMetaDoc> { return getDb().collection('league_meta') }
export function reportsMeta(): Collection<ReportMetaDoc> { return getDb().collection('reports_meta') }
export function getReportsBucket(): GridFSBucket { return new GridFSBucket(getDb(), { bucketName: 'reports' }) }
```

Database name: `bowling_league`. Collections: `league_meta` (single doc), `teams`, `bowlers`, `schedule`, `results`, `leaderboards`, `admins`, `reports_meta`. GridFS bucket: `reports` (creates `reports.files` and `reports.chunks` automatically).

The domain `id` field on Team, Bowler, etc. is stored as a plain string field in the document (e.g., `"t-1"`, `"b-rhonda-thompson"`). The MongoDB `_id` (ObjectId) is separate and internal. API responses strip `_id` and return only the domain `id`. This avoids coupling the client to ObjectId strings and preserves compatibility with the existing seed data IDs.

### Indexes (created once at startup)

After `connectDB`, `index.ts` calls an `ensureIndexes()` helper that creates these indexes (idempotent — `createIndex` is a no-op if the index already exists):

- `teams`: unique index on `{ id: 1 }` — enforces the domain-id uniqueness the POST duplicate-check assumes.
- `bowlers`: unique index on `{ id: 1 }`.
- `schedule`: unique index on `{ week: 1 }` — makes PUT/DELETE-by-week deterministic (Finding: schedule keying).
- `admins`: unique index on `{ username: 1 }` — guards the bootstrap/login lookup.

`league_meta` needs no index (singleton). `results` and `leaderboards` are addressed by `_id` / full-replace respectively and need no custom index. If a unique index creation fails because existing data already violates it (should not happen on a freshly seeded cluster), the error is fatal and logged with the index name — this surfaces data corruption early rather than letting nondeterministic by-key updates slip through.

---

## MongoDB Document Shapes

> **Illustrative only.** The JSON below documents field names, types, and layout — not the authoritative data. Transcribe the real seed values from the canonical dataset (`client/src/data/league.ts` at implementation time, copied verbatim into `server/src/seed.ts`; see Seed Script and Risk #2). The sample values happen to match real seed rows (e.g. the `teams` example is `t-4` exactly), but `seed.ts` is the single source of truth for actual values.

### league_meta (single document)
```json
{
  "_id": ObjectId,
  "season": "2026 Lakers",
  "currentWeek": 3,
  "currentWeekDate": "2026-09-23",
  "split": "Split 1 (Weeks 1 - 16)"
}
```

### teams
```json
{
  "_id": ObjectId,
  "id": "t-4",
  "number": "4",
  "name": "Team 4",
  "lane": 37,
  "won": 9,
  "lost": 3,
  "teamHdcp": 16,
  "teamAvg": 385,
  "scratch": 3402,
  "total": 3402,
  "bowlerIds": ["b-sadie-henriques", "b-joyce-smith", "b-cappy-boyce"]
}
```

### bowlers
```json
{
  "_id": ObjectId,
  "id": "b-rhonda-thompson",
  "name": "Rhonda Thompson",
  "gender": "F",
  "avg": 126,
  "entAvg": 121,
  "hdcp": 74,
  "gamesPlayed": 9,
  "pins": 1139,
  "highGame": 139,
  "highSeries": 395
}
```
The `vacant` field is only present (and `true`) on vacant bowlers. Absent otherwise.

### schedule
```json
{
  "_id": ObjectId,
  "week": 4,
  "date": "2026-09-30",
  "format": "Normal"
}
```

### results
```json
{
  "_id": ObjectId,
  "week": 2,
  "lanes": "35-36",
  "homeTeamId": "t-3",
  "awayTeamId": "t-1",
  "homeGames": [401, 430],
  "homeSeries": 1226,
  "awayGames": [392],
  "awaySeries": 0,
  "homePoints": 1,
  "awayPoints": 0
}
```

### leaderboards
```json
{
  "_id": ObjectId,
  "title": "High Average",
  "group": "Female",
  "entries": [
    { "rank": 1, "bowlerName": "Bernice Chase", "value": 141.89 },
    ...
  ]
}
```

### admins
```json
{
  "_id": ObjectId,
  "username": "admin",
  "passwordHash": "$2b$12$..."
}
```

### reports_meta
```json
{
  "_id": ObjectId,
  "gridFsFileId": ObjectId,
  "season": "2026 Lakers",
  "week": 3,
  "date": "2026-09-23",
  "filename": "week3.pdf",
  "contentType": "application/pdf",
  "sizeBytes": 245760,
  "uploadedAt": "2026-09-24T10:30:00.000Z"
}
```
The `id` returned in the API's `WeeklyReport` is `_id.toHexString()`.

---

## GET /api/league Assembly

This is the critical aggregation endpoint. It fetches the six source collections in parallel (`league_meta` + `teams` + `bowlers` + `schedule` + `results` + `leaderboards`) and assembles them into the exact `League` shape from `@bowling/shared`. The six reads map to five arrays (`teams`, `bowlers`, `schedule`, `lastWeekResults`, `leaderboards`) plus the four scalar meta fields (`season`, `currentWeek`, `currentWeekDate`, `split`). Reports are **not** part of the `League` document — the `reports_meta` collection and GridFS bucket are a separate feature and are never read here.

```typescript
async function assembleLeague(): Promise<League> {
  const [meta, allTeams, allBowlers, allSchedule, allResults, allLeaderboards] = await Promise.all([
    leagueMeta().findOne({}),
    teams().find({}).toArray(),
    bowlers().find({}).toArray(),
    schedule().find({}).sort({ week: 1 }).toArray(),
    results().find({}).toArray(),
    leaderboards().find({}).toArray(),   // NO .sort() — natural/insertion order is the display order (see PUT /api/leaderboards)
  ])

  if (!meta) throw new Error('League metadata not found')

  return {
    season: meta.season,
    currentWeek: meta.currentWeek,
    currentWeekDate: meta.currentWeekDate,
    split: meta.split,
    teams: allTeams.map(stripMongoId),
    bowlers: allBowlers.map(stripMongoId),
    schedule: allSchedule.map(stripMongoId),
    lastWeekResults: allResults.map(stripMongoId),
    leaderboards: allLeaderboards.map(stripMongoId),
  }
}
```

The `stripMongoId` utility removes `_id` from each document before returning. It uses destructuring: `const { _id, ...rest } = doc; return rest`. This ensures the client receives exactly the `League` interface — no extra MongoDB fields. Note that `schedule` is sorted by `week` for deterministic chronological display, but `leaderboards` is intentionally returned **unsorted** (natural insertion order is the authoritative display order — see PUT /api/leaderboards); do not add a `.sort()` to the leaderboards read. `teams`, `bowlers`, and `lastWeekResults` are returned in natural order (the client sorts teams by record where needed in the UI). If `league_meta` is empty, the endpoint returns 503 with `{ error: "League not initialized. Run the seed script." }` — this is the only expected startup failure for a fresh cluster.

All other GET endpoints (`/api/teams`, `/api/bowlers`, etc.) similarly fetch their collection and strip `_id` before returning.

GET `/api/teams/:id` looks up by the domain `id` field (not `_id`): `teams().findOne({ id: req.params.id })`. Returns 404 if not found.

---

## Auth Flow

### POST /api/auth/login

Request body: `{ username: string, password: string }`.

Validation: both fields required, both must be non-empty trimmed strings. On missing/empty fields → 400 `{ error: "Username and password are required" }`.

Flow:
1. Find admin by `username` (case-sensitive) in `admins` collection.
2. If not found → 401 `{ error: "Invalid credentials" }`. Same message whether user doesn't exist or password is wrong (prevents user enumeration).
3. Compare password with `passwordHash` using `bcryptjs.compare()`.
4. If mismatch → 401 `{ error: "Invalid credentials" }`.
5. Sign a JWT: `jwt.sign({ sub: username }, config.jwtSecret, { expiresIn: '7d' })`. The payload is minimal — just the username as `sub`.
6. Return 200 `LoginResponse`: `{ token: "...", user: { username } }`.

Failure modes: bcrypt comparison is always-time-safe. JWT signing can only fail if the secret is invalid (caught at startup). DB connection issues → 500 with generic error, logged server-side.

### GET /api/auth/me

Requires `Authorization: Bearer <token>` header (uses the auth middleware). Returns 200 `AdminUser`: `{ username }` extracted from the verified JWT payload.

### Auth Middleware (`src/auth/middleware.ts`)

Extracts the `Authorization` header, validates the `Bearer ` prefix, verifies the JWT with `jwt.verify()`. On success, attaches `req.user = { username }` (extend the Express Request type via declaration merging in a `src/types.d.ts`). On failure:
- Missing header → 401 `{ error: "Authentication required" }`
- Malformed header → 401 `{ error: "Invalid token format" }`
- Expired or invalid JWT → 401 `{ error: "Invalid or expired token" }`

The middleware is applied to all write routes and to GET `/api/auth/me`. It is NOT applied to public GET endpoints.

---

## Write Endpoints (JWT-protected)

All write routes are mounted behind the auth middleware. Input validation is done per-endpoint; invalid input returns 400 with a specific error message.

### Teams

- **POST /api/teams** — Creates a team. Body must include all `Team` fields. The `id` field is required and must be unique (check with `findOne({ id })`; 409 if duplicate). Inserts a document built from the validated `Team` whitelist (not the raw body) into the `teams` collection — see "Whitelist discipline for all writes". Returns 201 with the created team (stripped of `_id`).
- **PUT /api/teams/:id** — Updates a team by domain `id`. Body is a partial `Team` (all fields optional). **The URL `id` is authoritative and immutable via PUT: strip `id` (and any `_id`) from the update payload before `$set`** so a body carrying a different `id` cannot rename the domain key — renaming would silently break `bowlerIds` references and client `/teams/:id` routing, and bypass the `{ id: 1 }` unique index. The update is built from a whitelist of the mutable `Team` fields only (`number, name, lane, won, lost, teamHdcp, teamAvg, scratch, total, bowlerIds`); extra/unknown keys are dropped. Uses `findOneAndUpdate({ id }, { $set: whitelistedUpdate }, { returnDocument: 'after' })`. Returns 200 with the updated team, or 404.
- **DELETE /api/teams/:id** — Deletes by domain `id`. Uses `deleteOne({ id })`. Returns 204 on success, 404 if `deletedCount === 0`.

Validation for POST: `id` (string, required, non-empty), `number` (string, required), `name` (string, required, non-empty), `lane` (number, integer, > 0), `won`/`lost`/`teamHdcp`/`teamAvg`/`scratch`/`total` (numbers, >= 0), `bowlerIds` (array of strings). On any failure → 400 with the specific field and reason.

### Bowlers

Same CRUD pattern as teams. POST requires all `Bowler` fields. `id` must be unique. `gender` must be `"M"` or `"F"`. `avg`, `entAvg`, `hdcp`, `gamesPlayed`, `pins`, `highGame`, `highSeries` must be numbers >= 0. `vacant` is optional boolean. PUT follows the same identity-immutability rule as teams: **`id` (and `_id`) are stripped from the update payload** (the URL `id` is authoritative), and the `$set` is built from a whitelist of the mutable `Bowler` fields (`name, gender, avg, entAvg, hdcp, gamesPlayed, pins, highGame, highSeries, vacant`).

### Schedule

`week` is the natural key for schedule entries, and PUT/DELETE address rows by `week`. For that to be deterministic, `week` **must be unique**. This is enforced two ways: (1) a unique index `{ week: 1 }` is created on the `schedule` collection at startup (see Database Layer — Indexes), and (2) POST explicitly checks `findOne({ week })` and returns 409 if a row for that week already exists, matching the teams/bowlers duplicate-check pattern. The unique index is the authoritative guard; the pre-check gives a friendly 409 instead of a raw duplicate-key error.

- **POST /api/schedule** — Adds a scheduled match. `week` (positive integer, required, unique → 409 on duplicate), `date` (string, ISO-format `YYYY-MM-DD`, required), `format` (string, non-empty, required). Returns 201 with the created entry (stripped of `_id`).
- **PUT /api/schedule/:week** — Updates by week number (parsed as integer from URL param; 400 if not a positive integer). **`week` is the identity key and is immutable via PUT: strip `week` (and `_id`) from the update payload before `$set`** so a body carrying a different `week` cannot change it (which would collide with the `{ week: 1 }` unique index or orphan the row). The `$set` is built from a whitelist of the mutable `ScheduledMatch` fields (`date, format`). `findOneAndUpdate({ week }, { $set: whitelistedUpdate }, { returnDocument: 'after' })`. 404 if no row for that week. The URL week is authoritative.
- **DELETE /api/schedule/:week** — Deletes by week number. `deleteOne({ week })`. 204 on success, 404 if `deletedCount === 0`.

### Results

- **POST /api/results** — Adds a match result. Validates all `MatchResult` fields. `homeGames`/`awayGames` must be arrays of numbers. `homePoints`/`awayPoints` must be numbers >= 0.
- **PUT /api/results/:id** — Updates by MongoDB `_id` (hex string). This is the one entity where we use `_id` for update because results don't have a domain `id` field. Parse the hex string to ObjectId; 400 if invalid hex. The `$set` is built from a whitelist of the mutable `MatchResult` fields (`week, lanes, homeTeamId, awayTeamId, homeGames, homeSeries, awayGames, awaySeries, homePoints, awayPoints`); any `_id` in the body is stripped (the URL `_id` is authoritative).
- **DELETE /api/results/:id** — Same, by MongoDB `_id`.

### Whitelist discipline for all writes

A single rule governs every POST/PUT handler, so no implementer reintroduces a raw-body spread (`$set: body`, `insertOne(body)`, or `replaceOne({}, body)`):

- **Construct the persisted/updated document from an explicit per-collection whitelist of validated fields** — never from the raw request body. Unknown keys are silently dropped; required fields are always supplied by the whitelist (so `replaceOne` cannot drop one).
- **Identity fields are immutable via PUT and are never taken from the body**: `id` for teams and bowlers, `week` for schedule, `_id` for results. The URL parameter is authoritative. This protects the `{ id: 1 }` / `{ week: 1 }` unique indexes and prevents silent renames that would break `bowlerIds` references and client routing.
- POST handlers set the identity field from the validated body (POST is the only place `id`/`week` are assigned) and enforce uniqueness via the pre-check + unique index described per endpoint.

This discipline applies uniformly to teams, bowlers, schedule, results, and league meta. Leaderboards is a full-array replace (`deleteMany`+`insertMany`) whose per-object validation already rejects malformed entries; its documents carry no identity key to protect.

### League Meta

- **PUT /api/league/meta** — Upserts the single league_meta document. Body: `{ season, currentWeek, currentWeekDate, split }`. All fields required (`season`/`currentWeekDate`/`split` non-empty strings; `currentWeek` positive integer). **Whitelist the persisted document — do not write the raw body.** After validation, construct the replacement doc explicitly from the four validated fields and pass that to `replaceOne`: `replaceOne({}, { season, currentWeekDate, split, currentWeek }, { upsert: true })`. Only these four fields are ever persisted; any extra keys in the request body (e.g. `foo`) are dropped, and `replaceOne` cannot drop a required field because the whitelist always supplies all four. Returns 200 with the updated meta (stripped of `_id`). The same whitelist discipline applies to every other write endpoint — see "Whitelist discipline for all writes" below.

  **Singleton guarantee:** `replaceOne({}, ...)` with an empty filter is only well-defined if at most one `league_meta` document ever exists. The design guarantees this: the seed inserts exactly one meta doc after dropping the collection, and no endpoint ever *inserts* additional meta docs (PUT only upserts, matching the single existing doc or creating the first). The seed is the sole creator of the initial doc; PUT thereafter mutates that same doc. No code path produces a second meta document, so the empty-filter `replaceOne`/`findOne({})` used by GET /api/league is deterministic.

### Leaderboards

- **PUT /api/leaderboards** — Replaces all leaderboard documents. Body: an array of `Leaderboard` objects. Validation: each must have `title` (non-empty string), `group` (one of `"Male" | "Female" | "Team"`), `entries` (array). Each `LeaderboardEntry` must have `rank` (number), optional `bowlerName`/`teamName` (strings), and `value` which must be **`number | string`** to match the shared `LeaderboardEntry` type — validation accepts either and must not reject string values (the seed uses numbers, but the type permits strings and the API must not be stricter than the shared contract). Strategy: `deleteMany({})` then `insertMany(body, { ordered: true })` — drop all existing leaderboard docs and insert the new array. This is simpler and safer than diffing individual leaderboards, and because the whole set is small the full replace is cheap. Returns 200 with the inserted leaderboards (stripped of `_id`).

**Display order is insertion order (locked).** The `Leaderboard` shared type has no `id` and no sort field; its identity is `(title, group)` and the seed intentionally contains two leaderboards both titled `"High Average"` (groups `Male` and `Female`). Leaderboard display order is therefore defined as **the order of the array in the PUT body (and the seed), preserved by an ordered `insertMany`**. `GET /api/league` and `GET /api/leaderboards` **must NOT apply any `.sort()`** to leaderboards — they return documents in natural (insertion) order, which equals the order last written by the seed or a PUT. Implementers must not add an incidental sort key; reordering is done by sending a reordered PUT body. This is called out in both this PUT section and the GET /api/league assembly section so the two stay consistent. The replace runs as the two operations in sequence; if `insertMany` fails after `deleteMany`, the error is returned as 500 and logged — the caller should retry (acceptable for a single-admin tool; a transaction is not warranted for this low-contention case).

---

## GridFS PDF Storage (`src/routes/reports.ts`)

### POST /api/reports (JWT-protected)

Uses `multer` with `memoryStorage()` and a file filter that only accepts `application/pdf`. Max file size: 10 MB (configured in multer's `limits: { fileSize: 10 * 1024 * 1024 }`). Field name for the file: `file`. Additional form fields: `season` (string, required), `week` (number, required, positive integer), `date` (string, required, ISO format).

Flow:
1. Multer parses the multipart request. If no file → 400 `{ error: "A PDF file is required" }`. If not PDF (fileFilter rejects it) → 400 `{ error: "Only PDF files are accepted" }`. If the file exceeds 10 MB, multer throws a `MulterError` with code `LIMIT_FILE_SIZE`; the global error handler maps that to **413** `{ error: "File too large (max 10 MB)" }` (multer does not set the status itself — the handler does).
2. Open a GridFS upload stream: `bucket.openUploadStream(originalFilename, { contentType: 'application/pdf' })`.
3. Write `req.file.buffer` into the stream, await the `finish` event.
4. Create a `ReportMetaDoc` in `reports_meta` with the `gridFsFileId` pointing to the GridFS file's `_id`, plus the form fields and `uploadedAt: new Date().toISOString()`, `sizeBytes: req.file.size`, `filename: req.file.originalname`, `contentType: 'application/pdf'`.
5. Return 201 with `toWeeklyReport(metaDoc)` (the same explicit mapper used by GET /api/reports — never exposes `_id` or `gridFsFileId`).

Error handling: if the GridFS write succeeds but the metadata insert fails (unlikely but possible), delete the orphaned GridFS file in a catch block and return 500. If the GridFS write itself fails, return 500 `{ error: "Failed to store file" }` and log the error server-side.

### GET /api/reports (public)

Returns an array of `WeeklyReport` objects (metadata only, no file data). Sorted with a stable multi-key order `{ season: 1, week: 1 }` so reports group by season and order by week within each season.

**Season sort is lexical, acceptable for now.** `season` is a free-text string (`"2026 Lakers"`), so `{ season: 1 }` sorts lexically, not chronologically — fine for the current single-season use. If multiple seasons with names that don't sort naturally appear later (e.g. `"2026 Lakers"` vs `"2026 Spring"` vs `"2027 Lakers"`), add an explicit numeric `seasonOrder` field to `reports_meta` and sort on it, or sort client-side. Not in scope now; flagged so the lexical choice is a conscious decision, not an oversight.

Mapping uses an **explicit** `toWeeklyReport` function — never a blanket `stripMongoId` spread, which would leak the internal `gridFsFileId`:

```typescript
function toWeeklyReport(doc: ReportMetaDoc): WeeklyReport {
  return {
    id: doc._id!.toHexString(),
    season: doc.season,
    week: doc.week,
    date: doc.date,
    filename: doc.filename,
    contentType: doc.contentType,
    sizeBytes: doc.sizeBytes,
    uploadedAt: doc.uploadedAt,
  }
}
```

This returns exactly the eight `WeeklyReport` fields and drops both `_id` and `gridFsFileId`. The POST and GET-list handlers both use this mapper so the internal GridFS file id is never exposed to clients.

### GET /api/reports/:id (public)

1. Parse `:id` as an ObjectId. If invalid hex → 400.
2. Find the `ReportMetaDoc` by `_id`. If not found → 404.
3. Open a GridFS download stream: `bucket.openDownloadStream(doc.gridFsFileId)`.
4. Set response headers: `Content-Type: application/pdf`, `Content-Disposition: inline; filename="<original filename>"`.
5. Pipe the stream to the response. On stream error → 500.

### DELETE /api/reports/:id (JWT-protected)

1. Find the `ReportMetaDoc` by `_id`. If not found → 404.
2. Delete the GridFS file: `bucket.delete(doc.gridFsFileId)`.
3. Delete the metadata doc: `reportsMeta().deleteOne({ _id: doc._id })`.
4. Return 204.

If GridFS delete fails (file already missing) — log a warning but still delete the metadata and return 204 (idempotent behavior).

---

## Admin Bootstrap

In `src/seed.ts` and also in `src/index.ts` at startup (after DB connection, before listen):

```typescript
async function bootstrapAdmin(config: ServerConfig) {
  const existing = await admins().findOne({ username: config.adminUsername })
  if (!existing) {
    const hash = await bcrypt.hash(config.adminPassword, 12)
    await admins().insertOne({ username: config.adminUsername, passwordHash: hash })
    console.log(`Admin user "${config.adminUsername}" created.`)
  }
}
```

This runs on every startup but is idempotent — it only inserts if no admin with that username exists. The password used is from the env var (which was either already present or generated+appended by `env.ts`). The cost factor of 12 is a reasonable default for bcrypt.

---

## Seed Script (`src/seed.ts`)

### Getting data from the client

The seed script needs the hardcoded data from `client/src/data/league.ts`. That file imports from `../types` (the client-local types file). Rather than adding a complex cross-package import chain, the seed script will **copy the literal data values** into `src/seed.ts` as plain objects. The data is static (6 teams, 18 bowlers, 3 schedule entries, 3 results, 4 leaderboards) and transcribed from a PDF — it doesn't change. This avoids needing the seed script to resolve the client's TypeScript import graph.

The data in `seed.ts` will be typed using the interfaces from `@bowling/shared` to ensure it stays in sync with the domain model. The actual values are copied verbatim from `client/src/data/league.ts` **at implementation time** (before that file is deleted — the implementer transcribes the 6 teams, 18 bowlers, 3 schedule entries, 3 results, 4 leaderboards, and the meta scalars into `seed.ts`, then deletes `client/src/data/league.ts` per the Type Migration decision).

**Sequencing note:** because `client/src/data/league.ts` is deleted as part of the client migration, the copy into `seed.ts` must happen first. After deletion, `seed.ts` is the single source of truth for the seed dataset; there is no longer a second copy to drift from. (This also resolves the earlier assumption about `league.ts` being modified before seeding — it no longer exists post-migration.)

### Seed flow

1. Load env (same `env.ts` module).
2. Connect to MongoDB.
3. **Drop** all relevant collections (`league_meta`, `teams`, `bowlers`, `schedule`, `results`, `leaderboards`, `admins`). This makes the seed fully idempotent — repeated runs produce the same result.
4. Insert `league_meta`: `{ season: "2026 Lakers", currentWeek: 3, currentWeekDate: "2026-09-23", split: "Split 1 (Weeks 1 - 16)" }`.
5. Insert all 6 teams (with their domain `id` strings).
6. Insert all 18 bowlers.
7. Insert 3 schedule entries.
8. Insert 3 result entries.
9. Insert 4 leaderboard entries.
10. Bootstrap admin (same function as startup).
11. Disconnect and exit.

Each insert uses `insertMany` for the arrays. Errors are fatal — the script logs the error and exits with code 1.

The `reports_meta` collection and GridFS bucket are NOT seeded (no PDFs to seed). They are created on first upload.

---

## Express Bootstrap (`src/index.ts`)

```
1. import and run env.ts (synchronous, exits on failure)
2. await connectDB(config.mongoUri)
3. await bootstrapAdmin(config)
4. const app = express()
5. app.use(cors())                      // allow all origins for dev; can restrict later
6. app.use(express.json({ limit: '1mb' }))  // JSON parser, applied to all routes EXCEPT the upload
7. Mount routes:
   - GET  /api/health → { status: "ok" }
   - /api/auth → auth routes
   - /api/league, /api/league/meta → league routes
   - /api/teams → team routes
   - /api/bowlers → bowler routes
   - /api/schedule → schedule routes
   - /api/results → result routes
   - /api/leaderboards → leaderboard routes
   - /api/reports → report routes
8. Global error handler (catches multer errors, unexpected errors; returns JSON)
9. app.listen(config.port)
10. SIGTERM/SIGINT handler → closeDB() and process.exit
```

CORS is configured to allow all origins. This is acceptable for a personal/league site. If needed later, it can be restricted to the Vite dev server origin in development and the production domain.

**Body-parser vs upload boundary:** `express.json({ limit: '1mb' })` is registered globally and is the **only** JSON body parser in the entire app — no router registers its own `express.json()`. It parses every JSON request body, so all non-upload write endpoints (teams, bowlers, schedule, results, league meta, the leaderboards full-replace array) fall under this 1 MB limit, which is ample for the small payloads involved. Because `express.json()` skips any request whose `Content-Type` is not JSON, the `multipart/form-data` upload passes through it as a true no-op regardless of middleware ordering.

The upload route's handler chain is explicitly **`[upload.single('file'), handler]` with multer first** — multer runs ahead of the route handler and before any validation. The reports router registers no JSON parser of its own. Multer uses memory storage bounded by `limits: { fileSize: 10 * 1024 * 1024 }` (10 MB); the global JSON 1 MB limit never touches the upload because content-type negotiation routes the multipart body only through multer. In short: JSON writes ≤ 1 MB via the single global `express.json`; the one upload route is reached only by content-type and is bounded solely by multer's 10 MB file limit, with multer guaranteed to be its first middleware.

The global error handler catches `MulterError` specifically. Multer does **not** set an HTTP status itself — it throws a `MulterError` (e.g. code `LIMIT_FILE_SIZE` for oversize, `LIMIT_UNEXPECTED_FILE` for a wrong field name). The handler maps these explicitly: `LIMIT_FILE_SIZE` → **413** `{ error: "File too large (max 10 MB)" }`; `LIMIT_UNEXPECTED_FILE` → **400** `{ error: "Unexpected file field" }`; any other `MulterError` → 400 with its message. The handler must set the status code itself; it is not inherited from multer. All other unexpected errors → 500 `{ error: "Internal server error" }`, logged to stderr (never logging secrets or request bodies that could contain them).

---

## Client Changes

### Dependency: `@bowling/shared`

Add `"@bowling/shared": "*"` to `client/package.json` dependencies. Since `shared/` is a workspace sibling, npm resolves it via the workspace link.

### Type Migration

Delete `client/src/types.ts` (the task explicitly requires this — the client stops carrying a duplicate domain model and consumes `@bowling/shared`). Update every file that imports from `./types` or `../types` to import from `@bowling/shared` instead. Verified against the codebase (grep for `from '../types'` / `from './types'` / `from '../data/league'`):

- `client/src/data/league.ts` — currently `import type { League, Bowler, Team } from '../types'`. This is the **only** file that imports from `../types`. See the decision below on whether this file is kept or deleted.
- No page imports from `../types` directly; pages and `Layout.tsx` import the `league` value / helpers from `../data/league`, which is itself being replaced by the `useLeague()` provider.

**Decision on `client/src/data/league.ts` (reconciles the two sections that previously conflicted):** after the provider migration, no runtime code imports `league`/`getTeamById`/`getBowlerById` from this file anymore — pages use `useLeague()`, and the seed script holds its own verbatim copy of the data (it does not import this file). The file's only remaining purpose would be as a "reference dataset," but once `../types` is deleted it must repoint to `@bowling/shared`, which only type-checks after `shared/dist` is built (Build Prerequisite above) — so it is **no longer the self-contained, no-backend reference it used to be.**

Given that, and that the task says *"Do NOT delete client/src/data/league.ts unless its data has been copied into the seed script"* — the data **is** copied verbatim into `server/src/seed.ts`, which satisfies the precondition. We therefore **delete `client/src/data/league.ts`** along with `client/src/types.ts`. This removes the dead reference, eliminates the only `../types` importer, and avoids keeping a file whose "offline reference" value is undermined by its new dependency on built shared types. The canonical copy of the seed data now lives in exactly one place: `server/src/seed.ts`.

After deletion, run a project-wide grep to verify no remaining imports from `./types`, `../types`, or `../data/league` anywhere in `client/src/` — any straggler must be repointed to `@bowling/shared` (types) or `useLeague()` (data).

### API Client (`client/src/api/client.ts`)

A simple module exporting typed async functions. No class — just functions with a shared `BASE_URL` constant and a `getHeaders()` helper.

```typescript
const BASE_URL = '/api'

function getToken(): string | null {
  return localStorage.getItem('bowling-league.token')
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err = new Error(body.error || `Request failed: ${res.status}`) as Error & { status?: number }
    err.status = res.status   // carry the HTTP status so callers (e.g. session restore) can branch on 401/403 vs 5xx
    throw err
  }
  return res.json()
}
```

The thrown error carries a `status` property (and `undefined` status for a network-level failure where `fetch` itself rejects before producing a response). This lets `AuthContext`'s session restore distinguish an explicit 401/403 (clear the token) from a network/5xx error (keep the token and retry next load) — see AuthContext Rewrite below.

**Path convention (important):** `BASE_URL = '/api'` and `request()` builds the URL as `` `${BASE_URL}${path}` ``. Therefore every `path` argument passed to `request()` is **relative to `/api` and must NOT itself contain `/api`** — e.g. `fetchLeague` calls `request('/league')`, not `request('/api/league')`. The "GET /api/league" labels below describe the *final* URL hitting the server; the implemented `path` is the part after `/api`.

Exported functions (showing the final server path, and the `path` passed to `request()`):

- `fetchLeague(): Promise<League>` — GET /api/league → `request('/league')`
- `fetchTeams(): Promise<Team[]>` — GET /api/teams → `request('/teams')`
- `fetchTeam(id: string): Promise<Team>` — GET /api/teams/:id → `request(\`/teams/${id}\`)`
- `fetchBowlers(): Promise<Bowler[]>` — GET /api/bowlers → `request('/bowlers')`
- `fetchSchedule(): Promise<ScheduledMatch[]>` — GET /api/schedule → `request('/schedule')`
- `fetchResults(): Promise<MatchResult[]>` — GET /api/results → `request('/results')`
- `fetchLeaderboards(): Promise<Leaderboard[]>` — GET /api/leaderboards → `request('/leaderboards')`
- `login(username, password): Promise<LoginResponse>` — POST /api/auth/login → `request('/auth/login', { method: 'POST', body: JSON.stringify(...) })`
- `fetchMe(): Promise<AdminUser>` — GET /api/auth/me → `request('/auth/me')`
- `fetchReports(): Promise<WeeklyReport[]>` — GET /api/reports → `request('/reports')`
- `getReportUrl(id: string): string` — returns `` `${BASE_URL}/reports/${id}` `` = **`/api/reports/:id`** (used directly as a window.open / iframe URL, bypassing `request()`). This must NOT be `${BASE_URL}/api/reports/...`, which would wrongly produce `/api/api/reports/:id`.
- `uploadReport(data: FormData): Promise<WeeklyReport>` — POST /api/reports. Calls `fetch` directly (not `request()`) so it can omit the JSON `Content-Type` and let `FormData` set its own multipart boundary; it still attaches `authHeaders()` (Bearer token) manually.
- `deleteReport(id: string): Promise<void>` — DELETE /api/reports/:id → `request(\`/reports/${id}\`, { method: 'DELETE' })`
- Write functions for teams, bowlers, schedule, results, leagueMeta, leaderboards (POST/PUT/DELETE), each likewise using a `/…`-relative path (e.g. `createTeam` → `request('/teams', { method: 'POST', ... })`, `updateScheduleWeek` → `request(\`/schedule/${week}\`, ...)`, `putLeagueMeta` → `request('/league/meta', { method: 'PUT', ... })`, `putLeaderboards` → `request('/leaderboards', { method: 'PUT', ... })`).

Every exported function's `path` is audited against this rule: no `path` string begins with `/api`. The single exception is `getReportUrl`, which deliberately builds a full URL from `BASE_URL` + `/reports/:id` for use outside `request()`.

The token is stored in `localStorage` under key `bowling-league.token` (not the same key as the old auth, which stored a user object under `bowling-league.auth`).

### Vite Dev Proxy

The current `client/vite.config.ts` is just `defineConfig({ plugins: [react()] })` with **no `server` block**. This is an **additive edit** — add a `server.proxy` key, leaving `plugins` as-is:

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
})
```

This proxies all `/api` requests from the Vite dev server to the Express backend, avoiding CORS issues in development. `changeOrigin: true` rewrites the Host header so the backend sees its own origin (robust if the target is ever a non-localhost host). **Coupling note:** the target port `4000` is coupled to the server's `PORT` default (also 4000, see `env.ts` `config.port`). If `PORT` is overridden via env on the server, this proxy target must be updated to match — the two are not auto-synchronized.

### LeagueContext / Provider (`client/src/data/LeagueContext.tsx`)

A new file that replaces the direct imports from `league.ts`:

```typescript
interface LeagueContextValue {
  league: League | null
  loading: boolean
  error: string | null
  getTeamById: (id: string) => Team | undefined
  getBowlerById: (id: string) => Bowler | undefined
  refresh: () => void
}
```

The provider fetches `GET /api/league` once on mount (via `useEffect`). It stores the result in state. The `getTeamById` and `getBowlerById` helpers use `useMemo`-derived lookup maps for O(1) access, matching the existing helper function signatures.

The `refresh` function re-fetches the league data (used after admin writes).

Error state: if the fetch fails, `error` is set to the error message, `league` remains `null`, `loading` is `false`. This single error state is consumed two different ways by design (see Page Updates): page bodies render an `Alert severity="error"`, while `Layout.tsx` degrades silently via `league?.season ?? ''`. That divergence is intentional — the shell stays rendered with blank header text while the body shows the error — not an inconsistency.

The provider is mounted in `main.tsx` inside `AuthProvider` (league data doesn't depend on auth, but mounting inside auth keeps the tree simple and the provider can access auth state if needed for future admin features).

### Page Updates

Each page currently imports `{ league }` or `{ league, getTeamById, getBowlerById }` from `../data/league`. These imports are replaced with `useLeague()` from the provider:

```typescript
const { league, loading, error, getTeamById } = useLeague()

if (loading) return <CircularProgress />
if (error) return <Alert severity="error">{error}</Alert>
if (!league) return null  // shouldn't happen if not loading and no error
```

Pages affected:
- **StandingsPage** — uses `league.teams`, `league.split`, `league.currentWeek`
- **SchedulePage** — uses `league.schedule`
- **ScoresPage** — uses `league.lastWeekResults`, `getTeamById`
- **TeamsPage** — uses `league.teams`, `getBowlerById`
- **TeamDetailPage** — uses `getTeamById`, `getBowlerById` (see explicit ordering below)
- **LeaderboardsPage** — uses `league.leaderboards`, `league.currentWeek`
- **Layout.tsx** — uses `league.season`, `league.split`, `league.currentWeek` for header and footer text

**TeamDetailPage ordering (must-fix):** the current page calls `const team = teamId ? getTeamById(teamId) : undefined` at the top of render and immediately returns a "Team not found" screen when `team` is undefined. Under `useLeague()`, `league` is `null` while the fetch is in flight, so `getTeamById` returns `undefined` during loading — a naive migration would flash/stick on "Team not found" for a *valid* team (especially on a hard refresh of `/teams/:id`). The data-load guards **must run before** the team lookup and the `!team` early return:

```tsx
const { league, loading, error, getTeamById, getBowlerById } = useLeague()
if (loading) return <CircularProgress />
if (error) return <Alert severity="error">{error}</Alert>
if (!league) return null
const team = teamId ? getTeamById(teamId) : undefined
if (!team) return /* existing "Team not found" UI */
```

The `!team` check belongs strictly *after* the loading/error/`!league` guards. The same ordering (guards first, data access second) applies to every migrated page, but TeamDetailPage is the one where getting it wrong produces a misleading error rather than just a blank.

**Layout.tsx — intentional silent degrade:** Layout renders the app shell (AppBar season title, footer split/week text) and is always mounted around the page body. It must **not** block the whole shell on a spinner or replace itself with an error Alert. Instead it degrades silently using `league?.season ?? ''` (and similar) so the shell renders with empty/placeholder header text while the body handles state. This is a deliberate split of responsibility: **Layout degrades silently; page bodies surface loading (`CircularProgress`) and errors (`Alert severity="error"`).** On a backend outage the user sees the chrome with a blank season and a clear error inside the content area — intended, not an oversight.

### AuthContext Rewrite (`client/src/auth/AuthContext.tsx`)

The interface stays the same: `{ user, isAdmin, signIn, signOut }`.

Changes:
- **Token storage**: `localStorage` key changes to `bowling-league.token` (stores just the JWT string, not a user object).
- **signIn**: calls `api.login(username, password)`, stores `response.token` in localStorage, sets `user` to `response.user`.
- **signOut**: removes `bowling-league.token` from localStorage, sets `user` to null.
- **Session restore on load**: `useEffect` reads the token from localStorage. If present, calls `api.fetchMe()` to validate it. If valid, sets `user` from the response. **Distinguish auth failure from transient failure:** clear the token and set `user` to null **only on an explicit 401 or 403** from `fetchMe` (the token is genuinely invalid/expired). On a **network error or 5xx** (backend briefly down), **keep the token** and leave `user` null for this session — a transient outage is not proof the token is bad, and clearing it would force an avoidable re-login once the backend returns; the restore simply retries on the next page load. This requires the API client's `request()` to surface the HTTP status to the caller (e.g. throw an error carrying `status`, or have `fetchMe` return a discriminated result) so the provider can branch on 401/403 vs other failures. A `loading` state is added internally so the app doesn't flash an unauthenticated state on refresh — but this is internal to the provider. The `useAuth()` hook surface doesn't change (pages check `isAdmin`, not auth loading).
- **isAdmin**: `user !== null` (same as before — if there's a validated user, they're admin).

The old `bowling-league.auth` localStorage key is cleaned up: on first load, if it exists and `bowling-league.token` does not, remove the old key (one-time migration cleanup).

### Reports Feature

**Route**: `/reports`, registered in `App.tsx` alongside the other routes inside the `<Layout>` route.

**Nav item**: Add `{ to: '/reports', label: 'Reports' }` to the `navItems` array in `Layout.tsx`.

**ReportsPage** (`client/src/pages/ReportsPage.tsx`):

The page has two sections:

1. **Report list** (always visible): Fetches `GET /api/reports` on mount. Displays a `Table` with columns: Week, Season, Date, Filename, Size. Each row's "View" action is a **real anchor** — a MUI `Button`/`IconButton` with `component="a"`, `href={getReportUrl(report.id)}`, `target="_blank"`, and `rel="noopener"` — so the browser opens the inline PDF (served with `Content-Disposition: inline`) in a new tab from a genuine user-gesture navigation. This is preferred over `window.open(getReportUrl(id))`, which some popup blockers suppress even on a click. Alternative considered: an inline `<object>`/`<iframe>` embed — rejected because PDF rendering in embedded objects is inconsistent across browsers and MUI's dark theme makes the surrounding chrome look odd around a white PDF embed. A new-tab anchor is the robust, simplest UX.

2. **Upload form** (visible only when `isAdmin` is true): A `Card` with fields for season (text, defaults to current league season), week (number), date (date string), and a file input accepting only `.pdf`. On submit, creates a `FormData`, calls `api.uploadReport(formData)`, and on success refreshes the report list. Shows an MUI `Alert` on error. The file input is styled with an MUI `Button` wrapping a hidden `<input type="file" accept=".pdf">`.

   If admin is also signed in, each report row shows a "Delete" icon button that calls `DELETE /api/reports/:id` with confirmation (`window.confirm`).

The page uses `PageHeader` consistently with other pages. Loading state shows `CircularProgress`. Error state shows `Alert severity="error"`.

### Files deleted in the client migration

Two files are removed:

- `client/src/types.ts` — the duplicated client-local domain model, replaced everywhere by `@bowling/shared`.
- `client/src/data/league.ts` — the hardcoded seed source. Its data has been copied verbatim into `server/src/seed.ts` (satisfying the task's precondition for deletion), and no runtime code references it after the `useLeague()` provider migration. Deleting it removes the last `../types` importer and avoids keeping a stale "offline reference" that would itself depend on built `@bowling/shared`.

The single canonical copy of the seed dataset now lives in `server/src/seed.ts`. If the league data ever changes, it changes there.

See the Type Migration section above for the full reasoning that reconciles "delete `types.ts`" with "delete `data/league.ts`."

---

## Express Request Type Extension

Create `server/src/types.d.ts`:

```typescript
declare namespace Express {
  interface Request {
    user?: { username: string }
  }
}
```

This allows `req.user` to be set by the auth middleware and read by route handlers without type errors. `server/tsconfig.json` includes `["src"]`, so this file is part of the program.

**Constraint:** this file must contain **no top-level `import` or `export`** — that keeps it a global *script* file so `declare namespace Express { ... }` merges into the global `Express` namespace rather than becoming a local module augmentation. If any import is ever needed here, switch to the module form `declare global { namespace Express { interface Request { user?: { username: string } } } }` with an `export {}` to mark it a module. The script form above is preferred because it needs no imports.

---

## MUI v9 Constraints

The existing codebase already follows MUI v9 patterns. Key rules the implementation must follow:
- Typography does not accept shorthand system props like `fontWeight` or `fontStyle` as direct props. Use `sx={{ fontWeight: 700 }}` instead. The existing pages already do this correctly (e.g., ScoresPage uses `sx={{ fontWeight: homeWon ? 700 : 400 }}`).
- No `SportsBowling` icon exists in MUI icons. The app uses `Adjust` as its bowling icon — keep using it.
- Grid uses `size` prop (e.g., `size={{ xs: 12, md: 6 }}`) per MUI v9 — not the old `xs`, `md` shorthand.
- The dark theme in `theme.ts` is untouched.

---

## Testability

**Unit-testable** (no DB needed):
- `env.ts` — mock `fs.readFileSync`/`appendFileSync` and `process.env` to test the append-if-missing logic.
- `stripMongoId` utility — pure function.
- Input validation functions (if extracted into standalone validators).
- API client functions — mock `fetch`.
- LeagueContext — render with a mock provider or mock the API client.

**Integration-testable** (needs a running MongoDB, use `mongodb-memory-server` or a test container):
- All route handlers — use `supertest` against the Express app.
- Seed script — run against a test DB and verify collection contents.
- Auth flow — POST login, use token for protected endpoints.
- GridFS upload/download — upload a small PDF, verify stream output.

Test framework setup is outside scope of this task but the architecture supports it cleanly. Routes are mounted on an Express `Router` exported from each route file, making them individually testable with supertest.

---

## Risks and Unverified Assumptions

1. **Atlas cluster readiness**: The design assumes the Atlas cluster is accessible, the connection string in `atlas-credentials.env` is valid, and the user has readWrite permissions. If the cluster requires IP allowlisting, the developer's IP must be added. This cannot be verified at design time.

2. **Seed data accuracy**: The data copied into `server/src/seed.ts` is assumed to be the canonical, complete dataset for the 2026 Lakers Week 3 report (6 teams, 18 bowlers, 3 schedule entries, 3 results, 4 leaderboards). It is transcribed verbatim from `client/src/data/league.ts` at implementation time, after which that client file is deleted and `seed.ts` becomes the single source of truth. The transcription must be exact — a review of the copied values against the original is a required implementation step.

3. **MUI v9 specific API**: The design assumes the current MUI v9 Grid API (`size` prop) and other v9 conventions based on the existing code. If MUI is updated, Grid API may change.

4. **`@bowling/shared` must be built before type-checking / client build / `tsc -b`** — this is no longer hand-waved. See the "Build Prerequisite" section: `shared/dist` does not exist until `npm run build --workspace=shared` runs, and the client (Vite + IDE) and the server's `tsc -b` both resolve `@bowling/shared` through `shared/dist/index.d.ts`. The root `predev` script now builds shared automatically before `dev`, and `build` chains shared first. `tsx` (used by `dev --workspace=server` and `seed`) erases type-only imports at runtime, so the server *runtime* and the seed script run even without `shared/dist`; but any type-check or client build fails without it. The resolution is procedural (build order), not a code risk.

5. **File size limit**: 10 MB PDF limit is arbitrary but reasonable for scanned bowling score sheets. If the user's scans are higher resolution, this may need adjustment.

6. **Single admin**: The bootstrap creates one admin. The design doesn't include an admin-creation endpoint. If multiple admins are needed later, that's a future feature — the `admins` collection schema supports it.

7. **Results lack domain `id`**: The `MatchResult` interface in `@bowling/shared` has no `id` field. Write endpoints for results use MongoDB `_id` (as hex string) for update/delete addressing. This is a pragmatic choice; adding an `id` to the shared type would require a shared package change that's out of scope.

---

## Responses to Design Review

### Round 2 (current revision)

This revision addresses the second review `design-review.md` (verdict CHANGES_REQUESTED — 2 HIGH, 4 MEDIUM, 5 NIT). Every HIGH and MEDIUM is resolved; every NIT is addressed. Round-1 responses are preserved below for history.

**HIGH**

1. *`MONGODB_USERNAME`/`PASSWORD` loaded but unused; URI already embeds credentials, interpolation would corrupt it.* **Addressed.** Environment Loading Strategy step 1 now states that `MONGODB_URI` is used verbatim (full `user:password@host` userinfo, no placeholders, no DB-name path), that `MONGODB_USERNAME`/`MONGODB_PASSWORD` are reference-only and never read or interpolated, and that `ServerConfig` deliberately has no username/password fields. This is pinned as a locked decision so no implementer attempts credential substitution.

2. *Build order depends on `shared/tsconfig.json` (composite/declaration) which the design never verified exists.* **Addressed.** The Build Prerequisite section now records a verified precondition: `shared/tsconfig.json` already sets `composite: true`, `declaration: true`, `declarationMap: true`, `outDir: ./dist`, `rootDir: ./src`, `include: ["src"]` — exactly what `tsc -b` and the server's `{ "path": "../shared" }` project reference require. No change to `shared/tsconfig.json` is in scope; those two flags are flagged as a hard precondition. The `predev` ordering (runs to completion before the `&`-backgrounded dev processes) is also made explicit.

**MEDIUM**

3. *Upload route JSON-parser exemption relies on unstated middleware ordering.* **Addressed.** The Body-parser vs upload boundary note now states the global `express.json` is the only JSON parser (no router registers its own), that content-type negotiation makes it a true no-op for the multipart upload regardless of ordering, and that the `POST /api/reports` chain is `[upload.single('file'), handler]` with multer first.

4. *Leaderboard order after full-replace PUT is nondeterministic and undocumented.* **Addressed.** PUT /api/leaderboards now locks display order to insertion order via ordered `insertMany`, and both the PUT section and the GET /api/league assembly explicitly forbid applying any `.sort()` to leaderboards. Reordering is done by sending a reordered PUT body.

5. *PUT /api/league/meta writes raw body via `replaceOne`, persisting extras / risking field loss.* **Addressed.** The handler now builds the replacement document from an explicit whitelist `{ season, currentWeekDate, split, currentWeek }` rather than `body`. Generalized into a new "Whitelist discipline for all writes" subsection applied to all POST/PUT endpoints.

6. *PUT `$set: body` can mutate identity fields (`id`/`week`), bypassing uniqueness and breaking references/routing.* **Addressed.** Teams, Bowlers, and Schedule PUTs now strip the identity key (`id` / `week`, plus `_id`) from the update payload and `$set` only a per-collection whitelist of mutable fields; the URL parameter is authoritative and immutable. Results PUT whitelists its fields and strips `_id`. Consolidated in the "Whitelist discipline for all writes" subsection.

**NIT**

7. *Teams doc-shape example should be marked illustrative.* **Addressed.** Added a caption above the MongoDB Document Shapes block: illustrative only; `server/src/seed.ts` is the authoritative transcription source.

8. *`reports` sort by string `season` is lexical.* **Addressed.** GET /api/reports now notes the lexical ordering is acceptable for a single season and documents the `seasonOrder`/client-sort upgrade path for multi-season use.

9. *Session restore conflates 401 with network error.* **Addressed.** AuthContext session restore now clears the token only on explicit 401/403 and keeps it on network/5xx (retry next load); the API client `request()` was updated to throw an error carrying `status` so the provider can branch.

10. *`window.open` for PDF view may be popup-blocked.* **Addressed.** ReportsPage "View" is now a real anchor (`component="a"`, `href={getReportUrl(id)}`, `target="_blank"`, `rel="noopener"`) instead of `window.open`.

11. *`dev:server`/`dev:client` shown as new but already exist.* **Addressed.** The root scripts block now annotates `predev` as NEW, `dev` as REWRITTEN, and `dev:server`/`dev:client`/`build`/`seed` as unchanged, with prose reworded to match.

**Review's "Unverified / Wrong Assumptions" acknowledgements (round 2):** The WRONG item (env.ts implying username/password are used) is resolved by Finding #1 above. The UNVERIFIED `shared/tsconfig.json` item is resolved by Finding #2 (verified present with the required flags). The remaining runtime unknowns stay as stated assumptions, flagged for confirmation at implementation time: Atlas reachability/credentials/permissions/IP allowlist (Risk #1); the exact `MulterError` code constants (`LIMIT_FILE_SIZE`/`LIMIT_UNEXPECTED_FILE`) against the installed multer version (the global handler owns status mapping); and GridFS `openUploadStream`/`openDownloadStream`/`bucket.delete` behavior against the installed `mongodb` v6 driver (the orphan-cleanup-on-metadata-failure path should be tested, not assumed).

### Round 1 (prior revision — preserved for history)

This revision addressed the first review (verdict CHANGES_REQUESTED — 3 HIGH, 6 MEDIUM, 4 NIT). Every finding was resolved below.

**HIGH**

1. *Dev mode does not build `@bowling/shared`; `shared/dist` absent.* **Addressed.** New "Build Prerequisite" section: root `predev` builds shared before `dev`, `build` chains shared → server → client, and the dependency on `shared/dist/index.d.ts` for client/`tsc -b` (vs. `tsx`'s type-erasure at runtime) is stated. Risk #4 rewritten to reference it instead of hand-waving.

2. *TeamDetailPage reads `getTeamById` before the loading/error gate.* **Addressed.** Page Updates now specifies the exact ordering: loading → error → `!league` guards first, then `const team = getTeamById(...)` and the `!team` return. Called out as the one page where mis-ordering yields a misleading "Team not found" for a valid team.

3. *Inconsistent type migration (delete `types.ts` vs keep `data/league.ts`).* **Addressed.** Reconciled by **deleting both** `client/src/types.ts` and `client/src/data/league.ts`. The seed holds the verbatim data copy (satisfying the task's "do not delete unless copied into the seed" precondition), nothing references `data/league.ts` at runtime post-provider, and keeping it would leave a stale "offline reference" that now depends on built `@bowling/shared`. Type Migration and the (renamed) "Files deleted" sections are now consistent.

**MEDIUM**

4. *`vite.config.ts` proxy is additive and coupled to server PORT.* **Addressed.** Stated as an additive edit (current file has no `server` block), added `changeOrigin: true`, and documented the `4000` ↔ server `PORT` default coupling.

5. *`getReportUrl` double-prefixes `/api`.* **Addressed.** `getReportUrl` now returns `` `${BASE_URL}/reports/${id}` `` = `/api/reports/:id`. Added an explicit path convention plus an audit note that no `path` passed to `request()` includes `/api` (with per-function examples).

6. *GET /api/reports could leak `gridFsFileId`; sort incomplete.* **Addressed.** Added an explicit `toWeeklyReport(doc)` mapper returning exactly the eight `WeeklyReport` fields (drops both `_id` and `gridFsFileId`), used by both POST and GET-list; sort changed to the stable `{ season: 1, week: 1 }`.

7. *env.ts append format/detection unspecified vs quoted/commented lines.* **Addressed.** Specified bare `\nKEY=value` append format, a detection regex `^\s*KEY=` that skips comment (`#`) and whitespace-prefixed lines, and the `*.env` gitignore precondition for writing secrets.

8. *JSON parser vs multer boundaries not stated.* **Addressed.** Stated `express.json({ limit: '1mb' })` applies to all non-upload routes; `POST /api/reports` is exempt and uses route-level multer memory storage bounded by a 10 MB file limit. Also clarified multer does not set the HTTP status — the global handler maps `LIMIT_FILE_SIZE` → 413, `LIMIT_UNEXPECTED_FILE` → 400.

9. *Schedule week uniqueness unenforced; league_meta singleton unguaranteed.* **Addressed.** Added a unique index `{ week: 1 }` on `schedule` plus a POST 409 duplicate-check (new "Indexes" subsection also adds unique indexes on `teams.id`, `bowlers.id`, `admins.username`). Documented the `league_meta` singleton guarantee for `replaceOne({}, ...)` (seed is the sole creator; PUT only upserts the single doc).

**NIT**

10. *"six collections" wording.* **Addressed.** Reworded: six source reads → five arrays + four scalar meta fields; reports explicitly not part of `League`.

11. *`Express.Request` augmentation must stay import-free.* **Addressed.** Added the constraint that `types.d.ts` has no top-level import/export (script file for global merge), with the `declare global` fallback noted.

12. *Layout silent degrade vs page error alert should be stated as intentional.* **Addressed.** Both the LeagueContext error-state and the Layout note now state the split is deliberate: Layout degrades silently (`league?.season ?? ''`), page bodies surface the error.

13. *Leaderboard `value` may be a string per shared type.* **Addressed.** PUT /api/leaderboards validation now accepts `value: number | string` to match the shared `LeaderboardEntry` and avoid over-strict rejection.
