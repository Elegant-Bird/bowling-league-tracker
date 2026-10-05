# Implementation Plan — Bowling League Backend + Client Migration

Follow `design.md` exactly; the five MEDIUM and three NIT findings in `design-review.md` are
requirements, not suggestions. Shared types in `shared/src/index.ts` are frozen — do not edit them.

## Environment facts discovered during exploration (ground truth)

- Node v22.14.0, npm 10.9.2.
- `shared/dist` does NOT exist — building `@bowling/shared` is a hard prerequisite before any
  `tsc -b` type-check or the client/Vite build. `tsx` erases type-only imports, so the server dev
  runner and `seed` run without it.
- `shared/tsconfig.json` already has `composite`, `declaration`, `declarationMap`, `outDir: ./dist`,
  `rootDir: ./src`, `include: ["src"]` — no change needed; it is build-ready.
- `server/` exists but is EMPTY. All server files are created fresh.
- `atlas-credentials.env` at the repo root already defines `MONGODB_USERNAME`, `MONGODB_PASSWORD`,
  and `MONGODB_URI` (all double-quoted). It is MISSING `DB_NAME`, `JWT_SECRET`, `ADMIN_USERNAME`,
  `ADMIN_PASSWORD` — those four must be appended. `.gitignore` excludes `*.env`.
- The project is NOT a git repository (no `.git`). "Commit locally" steps cannot run until/unless a
  repo is initialized; if committing is required, `git init` + an initial commit is a precursor. Do
  not initialize git without instruction — note it and continue; verification does not depend on it.
- Client is MUI v9 (`^9.4.0`), react-router v6 (`^6.26.2`), React 18, Vite 5. Grid uses the v9
  `size={{...}}` prop. Pages use `sx={{ fontWeight }}` / `sx={{ fontStyle }}` (never Typography
  shorthand props). The bowling icon is `AdjustIcon` (no `SportsBowling`).
- `client/vite.config.ts` currently has NO `server` block — the proxy edit is additive.
- `App.tsx` uses a layout ROUTE (`<Route element={<Layout />}>` with `<Outlet />`), not a `<Layout>`
  wrapper element, and ends with `<Route path="*" .../>`. Register `/reports` as a child route; order
  is irrelevant in v6.
- Current `AuthContext` stores a user object under `bowling-league.auth`. The rewrite stores a JWT
  string under `bowling-league.token` and removes the old key on load.
- Consumers of hardcoded data (all six pages + `Layout.tsx`) import `league`/`getTeamById`/
  `getBowlerById` from `../data/league`; only `data/league.ts` imports `../types`.

## Secrets discipline (applies to every step)

Never print, log, echo, grep, or commit the contents of `atlas-credentials.env`. Reference keys by
name only. Server logs may name generated keys ("appended JWT_SECRET") but never values. The Atlas
password and the generated admin password must never appear in any committed file (including
`server/README.md`).

---

## Phase A — Shared build prerequisite + root scripts

- [ ] 1. Build `@bowling/shared` and add the `predev` root script.
      Add `"predev": "npm run build --workspace=shared"` to root `package.json` scripts and rewrite
      `"dev"` to `"npm run dev:server & npm run dev:client"`. Leave `dev:server`, `dev:client`,
      `build`, `seed` unchanged. Run `npm install` at the root first (links workspaces), then build
      shared.
      Files: `package.json` (root).
      Verify: `npm install` then `npm run build --workspace=shared` — exits 0 and
      `shared/dist/index.d.ts` + `shared/dist/index.js` exist.

---

## Phase B — Server (`@bowling/server`)

- [ ] 2. Scaffold the server package.
      Create `server/package.json` (name `@bowling/server`, `"type":"module"`, scripts
      dev=`tsx watch src/index.ts`, build=`tsc -b`, start=`node dist/index.js`, seed=`tsx src/seed.ts`;
      deps mongodb ^6, jsonwebtoken, bcryptjs, multer, dotenv, cors, express, `@bowling/shared":"*"`;
      devDeps tsx, typescript, @types/express, @types/cors, @types/jsonwebtoken, @types/bcryptjs,
      @types/multer) and `server/tsconfig.json` (ESM, `moduleResolution: bundler`, `composite: true`,
      `outDir ./dist`, `rootDir ./src`, `references: [{ "path": "../shared" }]`). Create
      `server/src/types.d.ts` with a global `declare namespace Express { interface Request { user?: { username: string } } }`
      and NO top-level import/export.
      Files: `server/package.json`, `server/tsconfig.json`, `server/src/types.d.ts`.
      Verify: `npm install` at root — resolves without error; `@bowling/server` appears in the
      workspace.

- [ ] 3. Implement `server/src/env.ts`.
      Load `../atlas-credentials.env` via `dotenv.config({ path })`. Build a typed `config`
      (`mongoUri, dbName, jwtSecret, adminUsername, adminPassword, port` — NO username/password
      fields). For each of `DB_NAME`(=`bowling_league`), `JWT_SECRET`(=`crypto.randomBytes(48)
      .toString('base64url')`), `ADMIN_USERNAME`(=`admin`), `ADMIN_PASSWORD`(=`crypto.randomBytes(16)
      .toString('base64url')`) missing from `process.env`: append a bare `\nKEY=value` line via
      `fs.appendFileSync` and set `process.env`. Detect existing keys by reading the raw file once and
      testing `^\s*KEY=` per line, skipping `#`-comment lines — never overwrite or re-quote existing
      keys. `MONGODB_URI` is used verbatim (dotenv already stripped its quotes); never interpolate
      username/password. Fail fast if `MONGODB_URI` or `JWT_SECRET` is still missing. Log key names
      only, never values. `port = Number(process.env.PORT) || 4000`.
      Files: `server/src/env.ts`.
      Verify: covered by step 11 (server boots and prints appended key names); until then
      `tsx server/src/env.ts` loads without throwing when the env file is present.

- [ ] 4. Implement `server/src/db.ts`.
      Single shared `MongoClient`; `connectDB(uri)` connects once + pings, `getDb()`, `closeDB()`.
      Import `{ ObjectId, GridFSBucket, type Collection, type Db } from 'mongodb'`; all `@bowling/shared`
      imports are `import type`. Define `TeamDoc`/`BowlerDoc`/`ScheduleDoc`/`ResultDoc`/
      `LeaderboardDoc`/`AdminDoc`/`ReportMetaDoc = Omit<WeeklyReport,'id'> & { _id?: ObjectId;
      gridFsFileId: ObjectId }`/`LeagueMetaDoc`. Typed collection getters for league_meta, teams,
      bowlers, schedule, results, leaderboards, admins, reports_meta, plus `getReportsBucket()`
      (bucketName `reports`). Generic
      `function stripMongoId<T extends { _id?: ObjectId }>({ _id, ...rest }: T): Omit<T,'_id'> { return rest }`.
      `ensureIndexes()` creating UNIQUE indexes on teams.id, bowlers.id, schedule.week,
      admins.username.
      Files: `server/src/db.ts`.
      Verify: compiles under step 10's `tsc -b`.

- [ ] 5. Implement auth: `server/src/auth/middleware.ts` and `server/src/auth/routes.ts`.
      Middleware extracts `Bearer` token, `jwt.verify`, sets `req.user = { username }`; 401 variants
      for missing/malformed/invalid. Routes: `POST /login` (validate non-empty username/password,
      bcrypt.compare vs `admins`, same `Invalid credentials` 401 for unknown user or bad password,
      sign `{ sub: username }` 7-day JWT, return `LoginResponse { token, user: { username } }`);
      `GET /me` (behind middleware, returns `AdminUser`).
      Files: `server/src/auth/middleware.ts`, `server/src/auth/routes.ts`.
      Verify: compiles under step 10; behavior checked in step 12.

- [ ] 6. Implement public read + league assembly: `server/src/routes/league.ts`.
      `GET /api/health` -> `{ status: 'ok' }`. `assembleLeague()` runs the six source reads in
      parallel (`leagueMeta().findOne({})`, teams, bowlers, schedule sorted `{week:1}`, results,
      leaderboards with NO `.sort()`), 503 if no meta, maps through `stripMongoId` into the exact
      `League` shape. Also `GET /teams`, `GET /teams/:id` (by domain `id`, 404), `GET /bowlers`,
      `GET /schedule`, `GET /results`, `GET /leaderboards` — each strips `_id`.
      Files: `server/src/routes/league.ts`.
      Verify: compiles under step 10; behavior in step 11.

- [ ] 7. Implement protected writes with whitelist discipline.
      Teams/bowlers/schedule/results CRUD + `PUT /league/meta` + `PUT /leaderboards`, all behind auth
      middleware. Every POST/PUT builds the persisted doc from an explicit per-collection field
      whitelist — never the raw body. Identity keys immutable on PUT: strip `id`/`_id` (teams,
      bowlers), `week`/`_id` (schedule), `_id` (results) from `$set`; URL param is authoritative. POST
      uniqueness pre-checks -> 409. `PUT /league/meta` whitelists `{season,currentWeek,
      currentWeekDate,split}` via `replaceOne({}, ..., {upsert:true})`. `PUT /leaderboards`
      full-replace via `deleteMany({})` then ordered `insertMany` (preserve insertion order; accept
      `value: number | string`). Results validation (EXACT, must accept the seed shape): `week`
      positive int; `lanes` non-empty string; `homeTeamId`/`awayTeamId` non-empty strings;
      `homeGames`/`awayGames` arrays of numbers >= 0, MAY be empty and MAY differ in length;
      `homeSeries`/`awaySeries` numbers >= 0, NOT required to equal game sums; `homePoints`/
      `awayPoints` numbers >= 0. Results PUT/DELETE address by `_id` hex (400 on bad hex). Proper
      status codes (201/200/204/400/404/409).
      Files: `server/src/routes/teams.ts`, `server/src/routes/bowlers.ts`,
      `server/src/routes/schedule.ts`, `server/src/routes/results.ts`,
      `server/src/routes/leaderboards.ts`, `server/src/routes/leagueMeta.ts`.
      Verify: compiles under step 10; behavior in step 12.

- [ ] 8. Implement GridFS reports: `server/src/routes/reports.ts`.
      Multer memory storage, `limits.fileSize = 10*1024*1024`, fileFilter accepts only
      `application/pdf`, field name `file`. `POST /api/reports` (JWT, chain `[upload.single('file'),
      handler]` multer-first): require file + `season`/`week`/`date`; open GridFS upload stream, write
      buffer, await finish; insert `ReportMetaDoc` (gridFsFileId, form fields, `uploadedAt` ISO,
      `sizeBytes`, `filename`, `contentType`); on metadata-insert failure delete the orphaned GridFS
      file; return 201 `toWeeklyReport(doc)` (the explicit 8-field mapper, never `stripMongoId`).
      `GET /api/reports` (public) lists `WeeklyReport[]` sorted `{season:1, week:1}` via
      `toWeeklyReport`. `GET /api/reports/:id` (public) streams the PDF with
      `Content-Type: application/pdf` and `Content-Disposition: inline`. `DELETE /api/reports/:id`
      (JWT) deletes GridFS file + metadata, idempotent, 204.
      Files: `server/src/routes/reports.ts`.
      Verify: compiles under step 10; behavior in step 12 if Atlas is reachable.

- [ ] 9. Implement `server/src/index.ts` + `bootstrapAdmin`.
      Run env, `connectDB`, `ensureIndexes`, `bootstrapAdmin` (insert admin from
      ADMIN_USERNAME/ADMIN_PASSWORD bcrypt-hashed cost 12 only if none exists). `express()`, `cors()`,
      `express.json({ limit: '1mb' })` as the SOLE JSON parser, mount all `/api` routes, global error
      handler mapping `MulterError` (`LIMIT_FILE_SIZE`->413, `LIMIT_UNEXPECTED_FILE`->400, else 400)
      and everything else ->500 (never log secrets), `app.listen(config.port)`, SIGTERM/SIGINT ->
      `closeDB`.
      Files: `server/src/index.ts`.
      Verify: compiles under step 10.

- [ ] 10. Build the server.
      Files: none (uses sources above).
      Verify: `npm run build --workspace=server` — `tsc -b` exits 0 (builds shared via the project
      reference first), `server/dist/index.js` exists. Fix all type errors before proceeding.

- [ ] 11. Implement `server/src/seed.ts`, write `server/README.md`, then run the seed.
      Copy the league data VERBATIM from `client/src/data/league.ts` into `seed.ts` as plain objects
      typed with `@bowling/shared` (`import type`): 6 teams, 18 bowlers, 3 schedule weeks, 3 results
      (keep `awaySeries: 0`, single-element `awayGames`, differing array lengths exactly), 4
      leaderboards (two titled `High Average`, groups Male then Female), meta `season '2026 Lakers'`,
      `currentWeek 3`, `currentWeekDate '2026-09-23'`, `split 'Split 1 (Weeks 1 - 16)'`. Flow: load
      env, connect, DROP the seven collections, insert all, `bootstrapAdmin`, disconnect. `README.md`
      documents env vars, scripts, the endpoint list, and that the admin password lives in the root
      `atlas-credentials.env` under `ADMIN_PASSWORD` (never print the value).
      Files: `server/src/seed.ts`, `server/README.md`.
      Verify: `npm run seed` from root. Expected: collections cleared + reseeded, admin bootstrapped,
      exit 0. ATLAS CONTINGENCY (see below) if the connection is refused.

- [ ] 12. Boot the server and verify endpoints end to end.
      Files: none.
      Verify: `npm run build --workspace=server && node server/dist/index.js` (background). Then:
      `curl -s localhost:4000/api/health` -> `{"status":"ok"}`; `curl -s localhost:4000/api/league`
      -> full League JSON with 6 teams / 4 leaderboards and NO `_id` fields; `POST /api/teams`
      WITHOUT a token -> 401; `POST /api/auth/login` with ADMIN_USERNAME + the generated
      ADMIN_PASSWORD -> `{token,user}`; the same `POST /api/teams` WITH `Authorization: Bearer <token>`
      -> 200/201. Stop the server afterward. ATLAS CONTINGENCY applies to every DB-touching check.

---

## Phase C — Client refactor

- [ ] 13. Add the shared dependency and the Vite proxy.
      Add `"@bowling/shared": "*"` to `client/package.json` deps; run `npm install`. Additively add a
      `server.proxy` block to `client/vite.config.ts` mapping `/api` -> `http://localhost:4000` with
      `changeOrigin: true` (keep `plugins: [react()]`).
      Files: `client/package.json`, `client/vite.config.ts`.
      Verify: `npm install` resolves; `client/vite.config.ts` still parses (checked by step 20 build).

- [ ] 14. Create `client/src/api/client.ts`.
      `BASE_URL='/api'`; `request<T>()` attaches `Authorization: Bearer <token>` from
      `localStorage['bowling-league.token']` when present and throws an Error carrying `status` on
      non-OK (so callers distinguish 401/403 from 5xx/network). Export read fns (fetchLeague, teams,
      team(id), bowlers, schedule, results, leaderboards), login, fetchMe, all writes (teams/bowlers/
      schedule/results CRUD, putLeagueMeta, putLeaderboards), fetchReports, uploadReport(FormData)
      (raw fetch, no JSON content-type, manual auth header), deleteReport, and
      `getReportUrl(id)` returning the RELATIVE `/api/reports/:id`. No `path` passed to `request()`
      begins with `/api`.
      Files: `client/src/api/client.ts`.
      Verify: compiles in step 20.

- [ ] 15. Create `client/src/data/LeagueContext.tsx`.
      Export `LeagueProvider` (component) and `useLeague()` (hook). Fetch `GET /api/league` once on
      mount; expose `{ league, loading, error, getTeamById, getBowlerById, refresh }` with
      `useMemo` lookup maps. On error: `error` set, `league` null, `loading` false.
      Files: `client/src/data/LeagueContext.tsx`.
      Verify: compiles in step 20.

- [ ] 16. Rewrite `client/src/auth/AuthContext.tsx` for real JWT auth.
      Keep the `{ user, isAdmin, signIn, signOut }` surface. `signIn` -> `api.login`, store
      `response.token` under `bowling-league.token`, set user. `signOut` clears the token. On load:
      unconditionally `localStorage.removeItem('bowling-league.auth')`, then if a token exists call
      `api.fetchMe()` — set user on success; clear the token ONLY on explicit 401/403; keep it on
      network/5xx. Internal `loading` guard so refresh doesn't flash signed-out. `isAdmin = user !== null`.
      Files: `client/src/auth/AuthContext.tsx`.
      Verify: compiles in step 20; `LoginPage.tsx` keeps working unchanged.

- [ ] 17. Wire providers in `client/src/main.tsx`.
      Nest `<AuthProvider><LeagueProvider><App/></LeagueProvider></AuthProvider>` inside the existing
      ThemeProvider/BrowserRouter.
      Files: `client/src/main.tsx`.
      Verify: compiles in step 20.

- [ ] 18. Migrate all six pages + `Layout.tsx` to `useLeague()`.
      Replace `../data/league` imports with `useLeague()` and `@bowling/shared` type imports.
      StandingsPage, SchedulePage, ScoresPage, TeamsPage, LeaderboardsPage: guard `loading`
      (`CircularProgress`), `error` (`Alert severity="error"`), `!league` (`return null`) BEFORE
      reading data. TeamDetailPage: the loading/error/`!league` guards MUST come before the `!team`
      "Team not found" early-return. `Layout.tsx`: degrade silently via `league?.season ?? ''` etc.
      (no spinner/Alert in the shell) and add a `{ to: '/reports', label: 'Reports' }` nav item. Use
      `sx` for fontWeight/fontStyle; keep `AdjustIcon` and Grid `size={{...}}`.
      Files: `client/src/pages/StandingsPage.tsx`, `SchedulePage.tsx`, `ScoresPage.tsx`,
      `TeamsPage.tsx`, `TeamDetailPage.tsx`, `LeaderboardsPage.tsx`,
      `client/src/components/Layout.tsx`.
      Verify: compiles in step 20.

- [ ] 19. Add `client/src/pages/ReportsPage.tsx` and register the route.
      List `GET /api/reports` in a Table (Week, Season, Date, Filename, Size); each View action is an
      anchor `component="a"` `href={getReportUrl(id)}` `target="_blank"` `rel="noreferrer"`. When
      `isAdmin`, show an upload form (season default = league season, week, date, PDF-only file input)
      POSTing via `api.uploadReport`, refreshing the list on success, with per-row Delete
      (`window.confirm` + `api.deleteReport`). CircularProgress while loading, Alert on error. Register
      `<Route path="/reports" element={<ReportsPage/>} />` as a child of the existing
      `<Route element={<Layout/>}>` in `App.tsx` — do NOT wrap in a literal `<Layout>`.
      Files: `client/src/pages/ReportsPage.tsx`, `client/src/App.tsx`.
      Verify: compiles in step 20.

- [ ] 20. Delete the obsolete client data/type files, then build the client.
      Delete `client/src/types.ts` and `client/src/data/league.ts` (data already copied into
      `seed.ts` in step 11). Grep `client/src` for any remaining `from '../types'`, `from './types'`,
      or `from '../data/league'` and repoint stragglers to `@bowling/shared` / `useLeague()`.
      Files: delete `client/src/types.ts`, `client/src/data/league.ts`.
      Verify: `npm run build --workspace=client` — `tsc -b && vite build` exits 0 with zero TS errors
      (shared is built from Phase A). Fix every error before finishing.

---

## Phase D — Full verification + cleanup

- [ ] 21. Run the full monorepo build and a final integration smoke test.
      Files: none.
      Verify: `npm run build` at root (shared -> server -> client) exits 0. If Atlas is reachable:
      start the server, `npm run dev:client`, load the app, confirm pages render from the API,
      sign in works, and the Reports page lists/uploads. Remove any temp files created during
      verification. Leave no secrets in tracked files.

---

## Atlas-reachability contingency (REQUIRED — do not dismiss silently)

Any step that connects to MongoDB (seed in step 11; league/write/report checks in steps 12 and 21)
depends on the Atlas cluster accepting the connection. If the connection is refused with an IP
allowlist or auth error, this is a REQUIRED MANUAL USER STEP: the user must open Atlas -> Network
Access and add the current machine IP (or `0.0.0.0/0` for dev), and confirm the DB user has
readWrite. Surface this clearly to the user and continue verifying everything that does not need the
live DB (all `tsc -b` builds, the client `vite build`, type-checks). Do not mark DB-dependent
verification as passed when it was skipped — report it as blocked on the manual Atlas step.

## Note on committing

There is no git repository here. Any "commit locally" instruction cannot run until a repo is
initialized. Do not run `git init` or commit without explicit instruction; note the absence and
proceed — none of the build/test verification depends on git.
