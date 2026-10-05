import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Bowler, League, Team } from '@bowling/shared'
import * as api from '../api/client'

interface LeagueContextValue {
  league: League | null
  loading: boolean
  error: string | null
  getTeamById: (id: string) => Team | undefined
  getBowlerById: (id: string) => Bowler | undefined
  refresh: () => void
}

const LeagueContext = createContext<LeagueContextValue | undefined>(undefined)

export function LeagueProvider({ children }: { children: ReactNode }) {
  const [league, setLeague] = useState<League | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.fetchLeague()
      setLeague(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load league data.')
      setLeague(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // O(1) lookup maps rebuilt whenever the league changes.
  const teamMap = useMemo(() => {
    const map = new Map<string, Team>()
    league?.teams.forEach((t) => map.set(t.id, t))
    return map
  }, [league])

  const bowlerMap = useMemo(() => {
    const map = new Map<string, Bowler>()
    league?.bowlers.forEach((b) => map.set(b.id, b))
    return map
  }, [league])

  const value = useMemo<LeagueContextValue>(
    () => ({
      league,
      loading,
      error,
      getTeamById: (id: string) => teamMap.get(id),
      getBowlerById: (id: string) => bowlerMap.get(id),
      refresh: () => {
        void load()
      },
    }),
    [league, loading, error, teamMap, bowlerMap, load],
  )

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>
}

export function useLeague(): LeagueContextValue {
  const ctx = useContext(LeagueContext)
  if (!ctx) {
    throw new Error('useLeague must be used within a LeagueProvider')
  }
  return ctx
}
