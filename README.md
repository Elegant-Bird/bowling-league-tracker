# 2026 Lakers Bowling League

A full-stack web app for displaying scores, standings, schedules, and rosters
for a weekly bowling league. Built with Vite + React + TypeScript on the
frontend and Express + MongoDB Atlas on the backend.

## Project structure

```
bowling-league-tracker/
  client/       React + Vite + MUI frontend
  server/       Express + MongoDB API (see server/README.md for full API docs)
  shared/       Domain types and scoring logic shared by both packages
  atlas-credentials.env   Secret config — gitignored, never commit this
```

## Prerequisites

- Node.js 22+
- A MongoDB Atlas cluster with a database user and your IP allowlisted
  (see [Atlas setup](#atlas-setup) below)

## Atlas setup

1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com) and create or
   resume your cluster.
2. Under **Network Access**, add your machine's public IP. To find it:
   ```bash
   curl -s ifconfig.me
   ```
3. Under **Database Access**, confirm your database user exists and has
   read/write access.
4. Copy your connection string and fill in `atlas-credentials.env` at the
   repo root:

```env
MONGODB_URI="mongodb+srv://<user>:<password>@<cluster>.mongodb.net"
```

The server auto-generates `DB_NAME`, `JWT_SECRET`, `ADMIN_USERNAME`, and
`ADMIN_PASSWORD` on first run if they are absent, appending them to
`atlas-credentials.env`. The generated admin password is stored there under
`ADMIN_PASSWORD` — read it from that file to sign in to the admin UI.

## Local development

```bash
npm install          # install all workspaces
npm run dev          # starts server (port 4000) + client (port 5173) concurrently
```

The client dev server proxies `/api/*` to `http://localhost:4000`, so no CORS
config is needed during development.

To seed the database with the initial league data:

```bash
npm run seed         # safe upsert — preserves any data entered via the admin UI
npm run seed -- --reset  # drop everything and rebuild from scratch
```

### Other scripts

```bash
npm run build        # type-check and build all packages
npm run dev:server   # server only
npm run dev:client   # client only
```

## Routes

| Path | Description |
|---|---|
| `/standings` | Team standings — home page |
| `/schedule` | Upcoming lane schedule |
| `/scores` | Previous week's match results |
| `/teams` | Team cards with rosters |
| `/teams/:teamId` | Single team roster and stats |
| `/leaderboards` | Season leaderboards |
| `/login` | Admin login |

## Auth

Anyone can browse the app. Logging in as admin gates write operations (entering
scores, editing rosters, uploading weekly reports). The admin account is
bootstrapped automatically from `atlas-credentials.env` on first server start.

---

## Docker deployment

The app ships as a single Docker image. Express serves the compiled React
client as static files and handles all `/api/*` routes — no separate web server
needed.

### Build and run

```bash
# On your server, with atlas-credentials.env present at the repo root:
docker compose up -d --build
```

The app will be available on port 4000. To check it's running:

```bash
docker compose logs -f
curl http://localhost:4000/api/health
```

### Expose to the internet with Nginx + HTTPS

Install Nginx and Certbot, then create `/etc/nginx/sites-available/bowling`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/bowling /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Add HTTPS (free via Let's Encrypt):
sudo certbot --nginx -d yourdomain.com
```

### Atlas IP allowlist for the server

Your Linux server needs its public IP allowlisted in Atlas — the same step as
local dev, just using the server's IP instead of your laptop's:

```bash
# Run this on the server to get its public IP
curl -s ifconfig.me
```

Add that IP in Atlas → Network Access → Add IP Address. If your server has a
static IP (recommended for production), pin it there. If not, `0.0.0.0/0`
works but allows connections from anywhere.

### Updating the app

```bash
git pull
docker compose up -d --build
```

### Seeding on the server

```bash
# Safe upsert (preserves admin-entered data)
docker compose run --rm app node server/dist/seed.js

# Full reset — drops all collections and rebuilds from seed data
docker compose run --rm app node server/dist/seed.js --reset
```
