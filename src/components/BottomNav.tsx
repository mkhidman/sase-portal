import { ClipboardCheck, CalendarDays, LayoutDashboard, MoreHorizontal, ChartNoAxesColumn } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import type { ComponentType } from 'react'

type BottomTab = { to: string; label: string; icon: ComponentType<{ size?: number }>; end?: boolean }

const tabs: BottomTab[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/jadwal', label: 'Jadwal', icon: CalendarDays },
  { to: '/absensi', label: 'Absensi', icon: ClipboardCheck },
  { to: '/rekap', label: 'Rekap', icon: ChartNoAxesColumn },
]

interface BottomNavProps {
  onOpenMore: () => void
  isMoreActive: boolean
}

export function BottomNav({ onOpenMore, isMoreActive }: BottomNavProps) {
  const location = useLocation()

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Navigasi utama">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => `bottom-nav-item ${isActive ? 'active' : ''}`}
        >
          <tab.icon size={22} />
          <span>{tab.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className={`bottom-nav-item ${isMoreActive ? 'active' : ''}`}
        onClick={onOpenMore}
        aria-label="Menu lainnya"
        aria-expanded={isMoreActive}
      >
        <MoreHorizontal size={22} />
        <span>Lainnya</span>
      </button>
    </nav>
  )
}
