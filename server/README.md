# @bowling/server

Express + MongoDB (Atlas) API for the bowling league app. ESM, TypeScript,
official `mongodb` driver v6, JWT auth, GridFS-backed PDF reports.

## Environment variables

All configuration is read from the root `atlas-credentials.env` file (gitignored).
Values are referenced here by **name only** — never commit or print secret values.

| Key                | Purpose                                                         |
| ------------------ | --------------------------------------------------------------- |
| `MONGODB_URI`      | Full Atlas connection string (used verbatim).                   |
| `MONGODB_USERNAME` | Human reference only — never read by the server.                |
| `MONGODB_PASSWORD` | Human reference only — never read by the server.                |
| `DB_NAME`          | Database name. Defaults to `bowling_league`; appended if absent.|
| `JWT_SECRET`       | Secret for signing JWTs. Random value generated if absent.      |
| `ADMIN_USERNAME`   | Bootstrap admin username. Defaults to `admin`; appended if absent. |
| `ADMIN_PASSWORD`   | Bootstrap admin password. Random value generated if absent.     |
| `PORT`             | Listen port. Defaults to `4000`.                                |

On first run, `env.ts` appends any missing keys (`DB_NAME`, `JWT_SECRET`,
`ADMIN_USERNAME`, `ADMIN_PASSWORD`) to `atlas-credentials.env` and logs only the
key names. **The generated admin password is stored in the root
`atlas-credentials.env` file under the `ADMIN_PASSWORD` key** — read it from
there to sign in. Its value is never printed to logs or written to this README.

## Scripts

Run from the repo root (workspace-aware) or inside `server/`:

- `npm run build --workspace=server` — type-check and compile to `dist/` (`tsc -b`).
- `npm run dev --workspace=server` — run with `tsx watch` (no build needed).
- `npm run start --workspace=server` — run the compiled `dist/index.js`.
- `npm run seed` (root) — safe upsert: inserts/updates seeded records by their
  natural key and bootstraps the admin. Does NOT delete anything, so data
  entered through the admin UI is preserved. Run `npm run seed -- --reset` to
  drop every collection and rebuild from scratch (destructive — only for a
  clean slate).

The shared package must be built first: `npm run build --workspace=shared`.

## API endpoints

Base path: `/api`.

### Public (no auth)

- `GET  /api/health` — `{ "status": "ok" }`.
- `GET  /api/league` — assembled `League` document (meta + teams + bowlers + schedule + results + leaderboards). `503` if not seeded.
- `GET  /api/teams` — all teams.
- `GET  /api/teams/:id` — one team by domain id (`404` if missing).
- `GET  /api/bowlers` — all bowlers.
- `GET  /api/schedule` — schedule entries sorted by week.
- `GET  /api/results` — all match results.
- `GET  /api/leaderboards` — leaderboards in insertion order.
- `GET  /api/reports` — report metadata list (sorted by season, then week).
- `GET  /api/reports/:id` — streams the PDF inline.

### Auth

- `POST /api/auth/login` — `{ username, password }` -> `{ token, user }`.
- `GET  /api/auth/me` — current admin (requires Bearer token).

### Protected (require `Authorization: Bearer <token>`)

- `POST   /api/teams`, `PUT /api/teams/:id`, `DELETE /api/teams/:id`
- `POST   /api/bowlers`, `PUT /api/bowlers/:id`, `DELETE /api/bowlers/:id`
- `POST   /api/schedule`, `PUT /api/schedule/:week`, `DELETE /api/schedule/:week`
- `POST   /api/results`, `PUT /api/results/:id`, `DELETE /api/results/:id`
- `PUT    /api/leaderboards` — full-array replace (preserves order).
- `PUT    /api/league/meta` — upsert the single league meta document.
- `POST   /api/reports` — multipart upload (`file` field, PDF only, max 10 MB).
- `DELETE /api/reports/:id` — delete the PDF and its metadata.

## Data model

Collections: `league_meta` (singleton), `teams`, `bowlers`, `schedule`,
`results`, `leaderboards`, `admins`, `reports_meta`. PDFs live in the GridFS
bucket `reports`. API responses strip the internal Mongo `_id` and expose only
the domain `id` fields from `@bowling/shared`.
