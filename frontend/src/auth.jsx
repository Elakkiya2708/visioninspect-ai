import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, tokenStore } from './api'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export const ROLE_LABEL = { admin: 'Administrator', quality_engineer: 'Quality Engineer', factory_supervisor: 'Factory Supervisor' }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!tokenStore.get())

  useEffect(() => {
    if (!tokenStore.get()) return
    api.me().then(setUser).catch(() => tokenStore.clear()).finally(() => setLoading(false))
  }, [])
  useEffect(() => {
    const h = () => setUser(null)
    window.addEventListener('vi:unauth', h)
    return () => window.removeEventListener('vi:unauth', h)
  }, [])

  const signIn = useCallback(async (fn) => {
    const r = await fn()
    tokenStore.set(r.access_token); setUser(r.user)
  }, [])
  const login = (email, password) => signIn(() => api.login(email, password))
  const register = (d) => signIn(() => api.register(d))
  const logout = () => { tokenStore.clear(); setUser(null) }
  const can = (...roles) => !!user && roles.includes(user.role)

  return <Ctx.Provider value={{ user, loading, login, register, logout, can }}>{children}</Ctx.Provider>
}
