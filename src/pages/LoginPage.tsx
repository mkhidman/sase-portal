import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ShieldCheck, UserRoundCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

export function LoginPage() {
  const { user, signIn, signInDemo, isDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
          <span className="brand-mark">SJ</span>
          <span><strong>Sensus Jamaah</strong><small>Sensus, absensi, dan pemantauan materi</small></span>
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
            <label>Email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="button primary full" disabled={submitting}>{submitting ? 'Memproses…' : 'Masuk'}</button>
          </form>
        )}
      </section>
    </main>
  )
}
