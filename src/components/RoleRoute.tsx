import { LayoutDashboard, ShieldAlert } from 'lucide-react'
import { Link, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { PageNotice } from './UI'

export function SuperadminRoute() {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role === 'superadmin') return <Outlet />
  return (
    <PageNotice
      icon={<ShieldAlert size={26} />}
      title="Halaman ini khusus Superadmin"
      description="Akun Admin / Wali Kelas hanya dapat membuka data kelas yang diampu. Hubungi Superadmin bila Anda memang memerlukan akses ke halaman ini."
      action={<Link className="button primary" to="/"><LayoutDashboard size={16} /> Kembali ke Dashboard</Link>}
    />
  )
}
