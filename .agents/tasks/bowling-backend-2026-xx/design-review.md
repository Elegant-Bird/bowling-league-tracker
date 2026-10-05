# Design Review: Bowling League Backend + Client Migration

Reviewed: `.agents/tasks/bowling-backend-2026-xx/design.md` (third revision)
Cross-checked against: `shared/src/index.ts`, `client/src/data/league.ts`, `client/src/types.ts`,
`client/src/App.tsx`, `client/src/components/Layout.tsx`, `client/src/pages/*`, `client/src/auth/AuthContext.tsx`,
`client/src/main.tsx`, `client/vite.config.ts`, `package.json`, `client/package.json`,
`shared/package.json`, `shared/tsconfig.json`, `.gitignore`, `atlas-credentials.env` (structure only).

This design has been through two prior review rounds and is unusually thorough. Most of what earlier
reviews raised is genuinely resolved and I re-verified the resolutions against source. The findings below
are what remains after that verification — a mix of one real correctness gap I could confirm by reading
`atlas-credentials.env`, plus specification gaps that would make an implementer guess.

---

## Findings

### 1. MEDIUM — `MONGODB_URI` is quoted in `atlas-credentials.env`; design never states the loader must handle (and the appender must preserve) quoting

Where: "Environment Loading Strategy (`src/env.ts`)", step 1 and the Append format note.

I read `atlas-credentials.env`. Every value is **double-quoted**, including the URI:
`MONGODB_URI="mongodb+srv://..."` and `MONGODB_USERNAME="elegantbird_db_user"`. The design's step-1
prose describes the URI as a bare `mongodb+srv://user:password@host/...` string and never acknowledges
the surrounding quotes. `dotenv` does strip surrounding matched quotes, so `config.mongoUri` ends up
unquoted at runtime — the design's conclusion happens to be correct — but the design presents this as if
the raw file value were bare. The gap is that the behavior is load-bearing (if an implementer ever reads
the file manually rather than through `dotenv`, e.g. in the append logic's "read raw file content once"
step, they will see the quotes) and it is never written down. The append-detection regex `^\s*KEY=` is
unaffected (it matches the key, not the value), so detection is fine; the risk is purely in how the URI
value is consumed.

Concrete fix: add one sentence to step 1: "Values in `atlas-credentials.env` are double-quoted;
`dotenv` strips the surrounding quotes, so `process.env.MONGODB_URI` is the unquoted connection string —
pass `config.mongoUri` to `new MongoClient()` as-is, do not re-strip or re-quote." And in the Append
format note, keep the existing "existing quoted values are left untouched" line (already present and
correct) but state explicitly that the raw-file read used for detection must not be confused with the
`dotenv`-parsed (unquoted) `process.env` values.

### 2. MEDIUM — `assembleLeague` / `stripMongoId` is typed to return `League` but `stripMongoId` is never given a signature, and its generic form will not produce the exact domain types

Where: "GET /api/league Assembly" and "Database Layer".

`assembleLeague` maps each collection through `stripMongoId` and returns the result directly as
`League`. The design describes `stripMongoId` only as "uses destructuring: `const { _id, ...rest } = doc;
return rest`" with no signature. For `allTeams.map(stripMongoId)` to type-check as `Team[]`,
`stripMongoId` must be generic over the doc type and return the type with `_id` removed, e.g.
`function stripMongoId<T extends { _id?: ObjectId }>(doc: T): Omit<T, '_id'>`. Without a stated signature,
an implementer may write `stripMongoId(doc: any): any`, which compiles but silently defeats the
type-safety the whole `League`-shape guarantee rests on; or they may write a non-generic version that
TypeScript rejects when fed `TeamDoc` vs `BowlerDoc`. This is the single most important function for the
"returns the exact `League` shape" claim and it has no contract.

Concrete fix: specify the signature:
```typescript
function stripMongoId<T extends { _id?: ObjectId }>({ _id, ...rest }: T): Omit<T, '_id'> {
  return rest
}
```
and note that `Omit<TeamDoc,'_id'>` is structurally `Team`, `Omit<BowlerDoc,'_id'>` is `Bowler`, etc., so
the `League` return type is satisfied without casts.

### 3. MEDIUM — Reports route placement relative to the `*` catch-all is unspecified, and the design mis-describes the existing routing shape

Where: "Reports Feature — Route".

The design says the `/reports` route is "registered in `App.tsx` alongside the other routes inside the
`<Layout>` route." I read `App.tsx`: there is no `<Layout>...</Layout>` wrapper element — Layout is a
**layout route** (`<Route element={<Layout />}>` with child routes rendered via `<Outlet />`). More
importantly, the existing routes end with `<Route path="*" element={<NotFoundPage />} />`. In
react-router v6 order within a `<Routes>` block does not matter for matching (most-specific wins), so a
`/reports` route added anywhere inside the layout route will match correctly — but the design should say
so explicitly rather than "inside the `<Layout>` route," which misrepresents the structure and could lead
an implementer to wrap `<ReportsPage/>` in a literal `<Layout>` element (double-nesting the shell).

Concrete fix: reword to "add `<Route path="/reports" element={<ReportsPage />} />` as a child of the
existing `<Route element={<Layout />}>` layout route (the one that renders `<Outlet />`), next to the
other page routes and before/after the `path="*"` route — order is irrelevant in v6."

### 4. MEDIUM — `main.tsx` edit to add the League provider is asserted but not specified, and the provider file/hook names are inconsistent

Where: "LeagueContext / Provider" and "Page Updates".

The design states "The provider is mounted in `main.tsx` inside `AuthProvider`" but `main.tsx`
(which I read) currently has no League provider and the design gives no concrete edit. Separately, the
file is named `client/src/data/LeagueContext.tsx`, the hook is called `useLeague()`, and the component is
referred to as "the provider" / "LeagueProvider" without ever naming the exported component. Every page
(StandingsPage, SchedulePage, ScoresPage, TeamsPage, TeamDetailPage, LeaderboardsPage) and `Layout.tsx`
must import this hook, so the exported names are a hard contract. I verified all seven consumers currently
import `league`/`getTeamById`/`getBowlerById` from `../data/league` and must be repointed.

Concrete fix: name the exports explicitly — "`LeagueContext.tsx` exports `LeagueProvider` (component)
and `useLeague()` (hook)" — and show the `main.tsx` edit:
```tsx
<AuthProvider>
  <LeagueProvider>
    <App />
  </LeagueProvider>
</AuthProvider>
```
Confirm `Layout` (rendered by the router inside `<App/>`) is within `LeagueProvider` — it is, since the
provider wraps `<App/>`.

### 5. MEDIUM — Validation rules omit `homeSeries`/`awaySeries` and the empty-array / zero-games case for results

Where: "Write Endpoints — Results — POST /api/results".

The POST validation says "Validates all `MatchResult` fields. `homeGames`/`awayGames` must be arrays of
numbers. `homePoints`/`awayPoints` must be numbers >= 0." It never states the rules for `homeSeries`,
`awaySeries`, `lanes`, `homeTeamId`, `awayTeamId`, or `week`. The seed data shows `awaySeries: 0` and
`awayGames: [392]` (a single game, and a series of 0) — so the real data has rows where the arrays are
non-empty but a series is 0, and where arrays have differing lengths. An implementer guessing "arrays
must be non-empty" or "series must equal the sum of games" would reject valid seed-shaped rows. Because
these endpoints are the admin's only way to enter weekly scores, the exact rules matter.

Concrete fix: specify per field — `week` (positive integer, required), `lanes` (non-empty string),
`homeTeamId`/`awayTeamId` (non-empty strings; optionally validate they exist in `teams`), `homeGames`/
`awayGames` (arrays of numbers `>= 0`, may be empty), `homeSeries`/`awaySeries` (numbers `>= 0`, **not**
required to equal the sum of games — the data has series totals independent of listed games),
`homePoints`/`awayPoints` (numbers `>= 0`). State that arrays of differing lengths are allowed.

### 6. NIT — `db.ts` snippet omits the `mongodb` type imports it uses

Where: "Database Layer (`src/db.ts`)".

The snippet uses `Collection<TeamDoc>`, `Db`, and `GridFSBucket` in return types but the shown import is
only `import { ObjectId } from 'mongodb'`. The claim that `tsx` runs the server without `shared/dist`
depends on every `@bowling/shared` import being `import type` (the snippet does use `import type` for the
shared domain types — good), so the missing imports here are purely cosmetic, but an implementer copying
the snippet verbatim gets a non-compiling file.

Concrete fix: show the full import, e.g.
`import { ObjectId, GridFSBucket, type Collection, type Db } from 'mongodb'`.

### 7. NIT — `getReportUrl`-based `<a target="_blank">` depends on the Vite dev proxy covering a full-page navigation, which is worth stating

Where: "API Client — `getReportUrl`" and "Reports Feature — Report list".

`getReportUrl(id)` returns `/api/reports/:id` and is used as an anchor `href` with `target="_blank"`.
In dev, that URL only resolves because the Vite proxy forwards `/api` to `http://localhost:4000` — which
the design does configure. This works for `fetch`-based XHR; it also works for a top-level/new-tab
navigation to a relative `/api/...` URL served from the Vite origin, so the design is correct. Worth one
sentence so an implementer doesn't "fix" it into an absolute `http://localhost:4000` URL that would then
break in production.

Concrete fix: add "The relative `/api/reports/:id` anchor href is resolved by the same Vite proxy in dev
and by the same-origin server in prod; do not hardcode the backend host."

### 8. NIT — Old `bowling-league.auth` cleanup condition is slightly ambiguous

Where: "AuthContext Rewrite".

"on first load, if it exists and `bowling-league.token` does not, remove the old key." This leaves the old
key in place whenever a new token *does* exist, which means a user who logged in under the new scheme
still has a stale `bowling-league.auth` object lingering. Harmless, but the stated condition reads as if it
were a deliberate guard when it is really just "remove the old key unconditionally on load." Simpler and
less surprising to remove it unconditionally.

Concrete fix: "On first load, unconditionally `localStorage.removeItem('bowling-league.auth')` — the new
scheme never reads it, so there is no reason to gate the cleanup on token presence."

---

## Verified Assumptions (checked against source, correct)

- **`shared/tsconfig.json` has `composite`, `declaration`, `declarationMap`, `outDir: ./dist`,
  `rootDir: ./src`, `include: ["src"]`.** Confirmed verbatim. The locked build order and the server's
  `{ "path": "../shared" }` project reference are sound.
- **`shared/dist` does not exist yet.** Confirmed (`shared/` contains only `package.json`, `src/`,
  `tsconfig.json`). The Build Prerequisite premise holds.
- **`shared/package.json` resolves `main`/`types`/`exports` to `./dist/...`.** Confirmed.
- **Root `package.json` already defines `dev:server`, `dev:client`, `build`, `seed`; `dev` is the
  backgrounded form the design says it will rewrite; no `predev` exists.** Confirmed — the "NEW /
  REWRITTEN / unchanged" annotations match the real file.
- **`.gitignore` excludes `*.env`.** Confirmed — writing generated secrets into `atlas-credentials.env`
  cannot be committed.
- **`MONGODB_URI` embeds real `user:password@host` credentials with no `<placeholder>` and no DB-name
  path segment.** Confirmed by parsing the file: userinfo present, contains `:`, no `<`/`>`, no path
  after host, no query string. The "use the URI verbatim, never interpolate, `ServerConfig` has no
  username/password fields" locked decision is correct. (The one unstated nuance — quoting — is
  Finding #1.)
- **`client/src/data/league.ts` is the only file importing from `../types`.** Confirmed by grep — all
  six pages and `Layout.tsx` import `league`/helpers from `../data/league`, and only `data/league.ts`
  imports `../types`. The Type Migration reasoning (delete both `types.ts` and `data/league.ts`,
  repoint consumers to `useLeague()`) is consistent with the actual import graph.
- **Seed data counts: 6 teams, 18 bowlers, 3 schedule entries, 3 results, 4 leaderboards.** Confirmed in
  `client/src/data/league.ts`.
- **Seed `leaderboards` contains two entries both titled "High Average" (groups Male and Female).**
  Confirmed — this is why `(title, group)` identity and insertion-order display are necessary; the
  locked "no `.sort()` on leaderboards" decision is justified.
- **All seed `LeaderboardEntry.value` are numbers (no strings).** Confirmed (grep for string values
  returned none). The design's note that the type permits `number | string` and validation must accept
  both — stricter than the data but matching the shared contract — is correct and the right call.
- **`shared/src/index.ts` shapes** (`Bowler`, `Team`, `ScheduledMatch`, `MatchResult`,
  `LeaderboardEntry`, `Leaderboard`, `League`, `WeeklyReport`, `AdminUser`, `LoginResponse`) match the
  Mongo document shapes and the `GET /api/league` assembly. `ReportMetaDoc = Omit<WeeklyReport,'id'> &
  { _id?: ObjectId; gridFsFileId: ObjectId }` and the explicit `toWeeklyReport` mapper return exactly the
  eight `WeeklyReport` fields. `LoginResponse = { token, user: AdminUser }` matches the login handler's
  `{ token, user: { username } }`. Confirmed consistent.
- **`client/vite.config.ts` currently has no `server` block.** Confirmed — the proxy edit is correctly
  described as additive.
- **`AuthContext` currently stores a user object under `bowling-league.auth`.** Confirmed — the move to a
  JWT string under `bowling-league.token` and the one-time cleanup are grounded in the real current code.
- **`TeamDetailPage` currently calls `getTeamById(teamId)` at the top of render and early-returns
  "Team not found" when undefined.** Confirmed — the must-fix guard-ordering (loading/error/`!league`
  before the `!team` return) addresses a real flash-of-"not found" bug on hard refresh.
- **MUI v9 is in use** (`@mui/material` / `@mui/icons-material` `^9.4.0` in `client/package.json`; pages
  use `sx={{ fontWeight }}` and `AdjustIcon`). The MUI v9 Constraints section matches reality.

## Unverified / Wrong Assumptions

- **WRONG (minor, now Finding #1): the design treats the `atlas-credentials.env` values as bare.** They
  are double-quoted in the file. The runtime outcome is still correct because `dotenv` strips quotes, but
  the design's description of the raw value is inaccurate and the quote-stripping is never stated.
- **UNVERIFIED (runtime, acknowledged by the design): Atlas reachability, credential validity, readWrite
  permissions, and IP allowlisting** (Risk #1). Cannot be checked at design time; connection string
  structure is valid.
- **UNVERIFIED (runtime, acknowledged): exact `MulterError` code constants** (`LIMIT_FILE_SIZE`,
  `LIMIT_UNEXPECTED_FILE`) against the installed multer version, and the status-mapping ownership (handler
  sets 413/400, not multer). Correct per the documented multer v1 API but not verifiable until installed.
- **UNVERIFIED (runtime, acknowledged): GridFS `openUploadStream` / `openDownloadStream` /
  `bucket.delete` behavior** against `mongodb` v6, including the orphan-cleanup-on-metadata-failure path.
  The design flags this to be tested rather than assumed — appropriate.
- **UNVERIFIED: the `tsx`-runs-without-`shared/dist` claim.** Correct in principle (type-only imports are
  erased) and the `db.ts`/`seed.ts` snippets use `import type` for `@bowling/shared`. Holds only if every
  server-side `@bowling/shared` import stays type-only; not machine-verified since `server/src` does not
  exist yet. See Finding #6.

---

## Verdict

5 MEDIUM + 3 NIT. Per the rule (any HIGH or MEDIUM ⇒ CHANGES_REQUESTED), the verdict is
**CHANGES_REQUESTED**. None of the MEDIUMs are architectural — they are specification gaps (quoting,
`stripMongoId` signature, provider wiring/naming, route placement, results validation) that an
implementer would otherwise have to guess. Tightening those five plus the three NITs gets this to
APPROVED.
