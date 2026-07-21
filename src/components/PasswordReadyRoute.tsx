import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export function PasswordReadyRoute() {
  const { user } = useAuth()
  return user?.mustChangePassword ? <Navigate to="/ganti-password" replace /> : <Outlet />
}
