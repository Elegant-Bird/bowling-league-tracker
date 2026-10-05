import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AdminUser } from '@bowling/shared'
import * as api from '../api/client'

// Client-side auth backed by the real JWT API.
//
// Login is OPTIONAL for visitors — anyone can browse the site. An
// authenticated "admin" session is what gates editing league data from the
// UI. The raw JWT is stored in localStorage under 'bowling-league.token'; the
// session is restored on load by validating the token against GET /api/auth/me.

interface AuthContextValue {
  user: AdminUser | null
  isAdmin: boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => void
}

// Old key from the pre-backend placeholder auth; cleaned up on load.
const LEGACY_STORAGE_KEY = 'bowling-league.auth'

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null)
  // Internal: avoids flashing a signed-out state while the token is validated
  // on load. Not exposed through the hook surface.
  const [, setLoading] = useState(true)

  // Restore any persisted session on load.
  useEffect(() => {
    // One-time cleanup: the new scheme never reads the old key.
    localStorage.removeItem(LEGACY_STORAGE_KEY)

    const token = api.getToken()
    if (!token) {
      setLoading(false)
      return
    }

    let cancelled = false
    api
      .fetchMe()
      .then((me) => {
        if (!cancelled) setUser(me)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Only clear the token on an explicit auth failure (401/403). On a
        // network error or 5xx the token may still be valid — keep it and let
        // the next load retry.
        const status = (err as { status?: number }).status
        if (status === 401 || status === 403) {
          api.clearToken()
          setUser(null)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    return {
      user,
      isAdmin: user !== null,
      async signIn(username: string, password: string) {
        const response = await api.login(username, password)
        api.setToken(response.token)
        setUser(response.user)
      },
      signOut() {
        api.clearToken()
        setUser(null)
      },
    }
  }, [user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
