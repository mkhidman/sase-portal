import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function SuperadminRoute() {
  const { user } = useAuth()
  return user?.role === 'superadmin' ? <Outlet /> : <Navigate to="/" replace />
}
