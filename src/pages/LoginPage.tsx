import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Eye, EyeOff, ShieldCheck, UserRoundCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { isSupabaseConfigured } from '../lib/supabase'

export function LoginPage() {
  const { user, signIn, signInDemo, isDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await signIn(email, password)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Login gagal.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark">SP</span>
          <span><strong>SASE Portal</strong><small>Sensus, absensi, dan pemantauan warga pengajian</small></span>
        </div>
        <div className="login-heading">
          <h1>Masuk ke aplikasi</h1>
          <p>{isDemo ? 'Pilih role untuk mencoba development build.' : 'Gunakan akun yang sudah dibuat oleh Superadmin.'}</p>
        </div>

        {isDemo ? (
          <div className="role-options">
            <button type="button" onClick={() => signInDemo('superadmin')}>
              <ShieldCheck size={22} />
              <span><strong>Superadmin</strong><small>Akses sensus, kelas, jadwal, absensi, rekap, dan admin.</small></span>
            </button>
            <button type="button" onClick={() => signInDemo('admin')}>
              <UserRoundCheck size={22} />
              <span><strong>Admin / Wali Kelas</strong><small>Hanya kelas yang diampu, termasuk lebih dari satu kelas.</small></span>
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={submit}>
            {!isSupabaseConfigured ? <div className="notice danger-notice">Konfigurasi Supabase belum tersedia. Hubungi pengelola deployment.</div> : null}
            <label>Email<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password
              <div className="password-input">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  title={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="button primary full" disabled={submitting || !isSupabaseConfigured}>{submitting ? 'Memproses…' : 'Masuk'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
