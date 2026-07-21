import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppUser } from '../types/domain'
import { DEMO_ADMIN, DEMO_SUPERADMIN } from '../data/demo'
import { isDemoMode, supabase } from '../lib/supabase'

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  isDemo: boolean
  signIn: (email: string, password: string) => Promise<void>
  signInDemo: (role: AppUser['role']) => void
  signOut: () => Promise<void>
  updatePassword: (password: string) => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const DEMO_ROLE_KEY = 'sensus-jamaah-demo-role'

async function loadSupabaseUser(userId: string): Promise<AppUser> {
  if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,email,role,active,must_change_password,last_login_at,admin_class_assignments(class_id)')
    .eq('id', userId)
    .single()
  if (error) throw error
  if (data.active === false) throw new Error('Akun ini sedang dinonaktifkan. Hubungi Superadmin.')
  return {
    id: data.id,
    name: data.full_name,
    email: data.email,
    role: data.role,
    assignedClassIds: (data.admin_class_assignments ?? []).map((item: { class_id: string }) => item.class_id),
    active: data.active ?? true,
    mustChangePassword: data.must_change_password ?? false,
    lastLoginAt: data.last_login_at ?? null,
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function refreshUser() {
    if (isDemoMode || !supabase) return
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      setUser(null)
      return
    }
    setUser(await loadSupabaseUser(data.user.id))
  }

  useEffect(() => {
    if (isDemoMode) {
      const role = localStorage.getItem(DEMO_ROLE_KEY)
      if (role === 'superadmin') setUser(DEMO_SUPERADMIN)
      if (role === 'admin') setUser(DEMO_ADMIN)
      setLoading(false)
      return
    }

    let active = true
    void supabase?.auth.getSession().then(async ({ data }) => {
      if (!active) return
      if (data.session?.user) {
        try {
          const loaded = await loadSupabaseUser(data.session.user.id)
          setUser(loaded)
          await supabase?.rpc('record_current_login')
        } catch {
          await supabase?.auth.signOut()
          setUser(null)
        }
      }
      setLoading(false)
    })

    const subscription = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setUser(null)
        return
      }
      void loadSupabaseUser(session.user.id)
        .then(async (loaded) => {
          setUser(loaded)
          await supabase?.rpc('record_current_login')
        })
        .catch(async () => {
          await supabase?.auth.signOut()
          setUser(null)
        })
    })

    return () => {
      active = false
      subscription?.data.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (isDemoMode || !supabase || !user) return
    const realtimeClient = supabase
    const refresh = () => {
      void loadSupabaseUser(user.id)
        .then(setUser)
        .catch(async () => {
          await realtimeClient.auth.signOut()
          setUser(null)
        })
    }
    const channel = realtimeClient
      .channel(`current-admin-profile-${user.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_class_assignments', filter: `admin_id=eq.${user.id}` }, refresh)
      .subscribe()
    return () => { void realtimeClient.removeChannel(channel) }
  }, [user?.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      isDemo: isDemoMode,
      async signIn(email, password) {
        if (isDemoMode) throw new Error('Gunakan tombol role pada mode demo.')
        if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        try {
          const loaded = await loadSupabaseUser(data.user.id)
          setUser(loaded)
          await supabase.rpc('record_current_login')
        } catch (cause) {
          await supabase.auth.signOut()
          throw cause
        }
      },
      signInDemo(role) {
        localStorage.setItem(DEMO_ROLE_KEY, role)
        setUser(role === 'superadmin' ? DEMO_SUPERADMIN : DEMO_ADMIN)
      },
      async signOut() {
        if (isDemoMode) {
          localStorage.removeItem(DEMO_ROLE_KEY)
          setUser(null)
          return
        }
        await supabase?.auth.signOut()
        setUser(null)
      },
      async updatePassword(password) {
        if (password.length < 8) throw new Error('Password baru minimal 8 karakter.')
        if (isDemoMode) {
          setUser((current) => current ? { ...current, mustChangePassword: false } : current)
          return
        }
        if (!supabase) throw new Error('Supabase belum dikonfigurasi.')
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        const complete = await supabase.rpc('complete_password_change')
        if (complete.error) throw complete.error
        await refreshUser()
      },
      refreshUser,
    }),
    [loading, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth harus digunakan di dalam AuthProvider.')
  return value
}
