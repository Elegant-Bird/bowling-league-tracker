import type {
  AdminUser,
  Bowler,
  Leaderboard,
  League,
  LoginResponse,
  MatchResult,
  ScheduledMatch,
  Team,
  WeeklyReport,
} from '@bowling/shared'

// Thin API client for the Express backend. All endpoints live under /api,
// which the Vite dev server proxies to http://localhost:4000 and which is
// served same-origin in production. Every `path` passed to request() is the
// part AFTER /api (e.g. request('/league')); only getReportUrl builds a full
// URL from BASE_URL for use outside request().

const BASE_URL = '/api'

const TOKEN_KEY = 'bowling-league.token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** An Error carrying the HTTP status (undefined for network-level failures). */
export type ApiError = Error & { status?: number }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { error?: string }))
    const err = new Error(body.error || `Request failed: ${res.status}`) as ApiError
    err.status = res.status
    throw err
  }
  // 204 No Content and other empty bodies: don't attempt to parse JSON.
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// --- Public reads ---------------------------------------------------------

export function fetchLeague(): Promise<League> {
  return request<League>('/league')
}

export function fetchTeams(): Promise<Team[]> {
  return request<Team[]>('/teams')
}

export function fetchTeam(id: string): Promise<Team> {
  return request<Team>(`/teams/${id}`)
}

export function fetchBowlers(): Promise<Bowler[]> {
  return request<Bowler[]>('/bowlers')
}

export function fetchSchedule(): Promise<ScheduledMatch[]> {
  return request<ScheduledMatch[]>('/schedule')
}

export function fetchResults(): Promise<MatchResult[]> {
  return request<MatchResult[]>('/results')
}

export function fetchLeaderboards(): Promise<Leaderboard[]> {
  return request<Leaderboard[]>('/leaderboards')
}

// --- Auth -----------------------------------------------------------------

export function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

export function fetchMe(): Promise<AdminUser> {
  return request<AdminUser>('/auth/me')
}

// --- Protected writes: teams ----------------------------------------------

export function createTeam(team: Team): Promise<Team> {
  return request<Team>('/teams', { method: 'POST', body: JSON.stringify(team) })
}

export function updateTeam(id: string, team: Partial<Team>): Promise<Team> {
  return request<Team>(`/teams/${id}`, { method: 'PUT', body: JSON.stringify(team) })
}

export function deleteTeam(id: string): Promise<void> {
  return request<void>(`/teams/${id}`, { method: 'DELETE' })
}

// --- Protected writes: bowlers --------------------------------------------

export function createBowler(bowler: Bowler): Promise<Bowler> {
  return request<Bowler>('/bowlers', { method: 'POST', body: JSON.stringify(bowler) })
}

export function updateBowler(id: string, bowler: Partial<Bowler>): Promise<Bowler> {
  return request<Bowler>(`/bowlers/${id}`, { method: 'PUT', body: JSON.stringify(bowler) })
}

export function deleteBowler(id: string): Promise<void> {
  return request<void>(`/bowlers/${id}`, { method: 'DELETE' })
}

// --- Protected writes: schedule -------------------------------------------

export function createScheduleMatch(match: ScheduledMatch): Promise<ScheduledMatch> {
  return request<ScheduledMatch>('/schedule', { method: 'POST', body: JSON.stringify(match) })
}

export function updateScheduleWeek(
  week: number,
  match: Partial<ScheduledMatch>,
): Promise<ScheduledMatch> {
  return request<ScheduledMatch>(`/schedule/${week}`, {
    method: 'PUT',
    body: JSON.stringify(match),
  })
}

export function deleteScheduleWeek(week: number): Promise<void> {
  return request<void>(`/schedule/${week}`, { method: 'DELETE' })
}

// --- Protected writes: results --------------------------------------------

export function createResult(result: MatchResult): Promise<MatchResult> {
  return request<MatchResult>('/results', { method: 'POST', body: JSON.stringify(result) })
}

export function updateResult(id: string, result: Partial<MatchResult>): Promise<MatchResult> {
  return request<MatchResult>(`/results/${id}`, { method: 'PUT', body: JSON.stringify(result) })
}

export function deleteResult(id: string): Promise<void> {
  return request<void>(`/results/${id}`, { method: 'DELETE' })
}

// --- Protected writes: league meta + leaderboards -------------------------

export function putLeagueMeta(meta: {
  season: string
  currentWeek: number
  currentWeekDate: string
  split: string
}): Promise<unknown> {
  return request('/league/meta', { method: 'PUT', body: JSON.stringify(meta) })
}

export function putLeaderboards(leaderboards: Leaderboard[]): Promise<Leaderboard[]> {
  return request<Leaderboard[]>('/leaderboards', {
    method: 'PUT',
    body: JSON.stringify(leaderboards),
  })
}

// --- Reports --------------------------------------------------------------

export function fetchReports(): Promise<WeeklyReport[]> {
  return request<WeeklyReport[]>('/reports')
}

/**
 * Relative URL to stream a report PDF inline. Used directly as an anchor href
 * / new-tab target, bypassing request(). Resolved by the Vite proxy in dev and
 * the same-origin server in prod — do not hardcode the backend host.
 */
export function getReportUrl(id: string): string {
  return `${BASE_URL}/reports/${id}`
}

export async function uploadReport(data: FormData): Promise<WeeklyReport> {
  // Use fetch directly so FormData can set its own multipart Content-Type
  // boundary; still attach the Bearer token manually.
  const res = await fetch(`${BASE_URL}/reports`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: data,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { error?: string }))
    const err = new Error(body.error || `Request failed: ${res.status}`) as ApiError
    err.status = res.status
    throw err
  }
  return res.json() as Promise<WeeklyReport>
}

export function deleteReport(id: string): Promise<void> {
  return request<void>(`/reports/${id}`, { method: 'DELETE' })
}
