# 2026 Lakers Bowling League

A web app for displaying scores, standings, schedules, and rosters for a weekly
bowling league. Built with Vite + React + TypeScript.

## Getting started

```bash
npm install
npm run dev      # start the dev server (http://localhost:5173)
npm run build    # type-check and build for production
npm run preview  # preview the production build
```

## Project structure

```
src/
  main.tsx              App entry; sets up Router + AuthProvider
  App.tsx               Route definitions
  types.ts              Domain model (teams, bowlers, matches, scores)
  data/league.ts        Seed data transcribed from the league report
  auth/AuthContext.tsx  Optional client-side admin auth (placeholder)
  components/Layout.tsx  Shared header/nav/footer
  pages/                One component per route
    StandingsPage       Team standings table (default route)
    SchedulePage        Upcoming weeks
    ScoresPage          Last week's match results
    TeamsPage           Team cards with rosters
    TeamDetailPage      A single team's roster + stats
    LeaderboardsPage    Season leaderboards
    LoginPage           Optional admin login
    NotFoundPage        404
```

## Routes

- `/standings` — team standings (home)
- `/schedule` — upcoming lane schedule
- `/scores` — previous week's scores
- `/teams` and `/teams/:teamId` — rosters
- `/leaderboards` — season leaderboards
- `/login` — optional admin login

## Auth

Login is optional — anyone can browse. The admin session (currently a
localStorage placeholder in `src/auth/AuthContext.tsx`) is what will gate
editing league data from the UI once a backend exists. Replace `signIn` with a
real API call then.

## Next steps

- Add a backend/API so an admin can edit teams, scores, and schedule from the UI
- Replace placeholder auth with real credentials + tokens
- Expand weekly scores and top-scores sections to match the full report
```
