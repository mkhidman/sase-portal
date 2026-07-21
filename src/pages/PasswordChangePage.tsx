import { Eye, EyeOff, KeyRound, LogOut } from 'lucide-react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function PasswordChangePage() {
  const { user, updatePassword, signOut } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!user) return <Navigate to="/login" replace />
  if (!user.mustChangePassword) return <Navigate to="/" replace />

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      setError('Password baru minimal 8 karakter.')
      return
    }
    if (password !== confirmation) {
      setError('Konfirmasi password belum sama.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updatePassword(password)
      navigate('/', { replace: true })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Password gagal diperbarui.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="password-change-page">
      <section className="password-change-card">
        <span className="password-change-icon"><KeyRound size={26} /></span>
        <div>
          <h1>Ganti password terlebih dahulu</h1>
          <p>Password akun <strong>{user.email}</strong> dibuat atau direset oleh Superadmin. Buat password pribadi sebelum membuka aplikasi.</p>
        </div>
        <form onSubmit={submit} className="password-change-form">
          <label className="field"><span>Password baru</span><div className="password-input"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
          <label className="field"><span>Ulangi password</span><input type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" /></label>
          {error ? <p className="form-error">{error}</p> : null}
          <button className="button primary full" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan password baru'}</button>
        </form>
        <button className="button outline full" type="button" onClick={() => void signOut()}><LogOut size={16} /> Keluar dari akun</button>
      </section>
    </main>
  )
}
