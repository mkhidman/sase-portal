import {
  Activity,
  Archive,
  BookOpenCheck,
  CalendarDays,
  ChartNoAxesColumn,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ContactRound,
  Database,
  Download,
  FileChartColumn,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  FileText,
  Menu,
  Settings,
  ShieldCheck,
  Shuffle,
  UserRoundCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { usePwaInstall } from '../hooks/usePwaInstall'
import { formatDateTime } from '../lib/utils'
import { BottomNav } from './BottomNav'
import { MobileMoreMenu } from './MobileMoreMenu'

type NavItem = { to: string; label: string; icon: ComponentType<{ size?: number }> }
type NavGroup = { id: string; label: string; icon: ComponentType<{ size?: number }>; items: NavItem[] }

const BOTTOM_NAV_ROUTES = new Set(['/', '/jadwal', '/absensi', '/rekap'])

const dashboard: NavItem = { to: '/', label: 'Dashboard', icon: LayoutDashboard }

function navigationFor(role: 'superadmin' | 'admin'): NavGroup[] {
  if (role === 'superadmin') {
    return [
      {
        id: 'data-jamaah', label: 'Data Warga', icon: Database,
        items: [
          { to: '/sensus', label: 'Data Sensus', icon: Database },
          { to: '/kualitas-data', label: 'Kualitas Data', icon: ShieldCheck },
          { to: '/arsip-jamaah', label: 'Status & Arsip', icon: Archive },
          { to: '/keluarga-wali', label: 'Keluarga & Wali', icon: ContactRound },
        ],
      },
      {
        id: 'pengajian', label: 'Pengajian', icon: CalendarDays,
        items: [
          { to: '/kelas', label: 'Kelas Pengajian', icon: GraduationCap },
          { to: '/jadwal', label: 'Jadwal Pengajian', icon: CalendarDays },
          { to: '/absensi', label: 'Absensi Kelas', icon: ClipboardCheck },
          { to: '/tindak-lanjut', label: 'Tindak Lanjut Absensi', icon: UserRoundCheck },
          { to: '/materi', label: 'Hasda & ASAD', icon: BookOpenCheck },
          { to: '/kenaikan-kelas', label: 'Kenaikan & Mutasi', icon: Shuffle },
        ],
      },
      {
        id: 'musyawarah', label: 'Musyawarah', icon: FileText,
        items: [
          { to: '/notulensi', label: 'Notulensi', icon: FileText },
          { to: '/notulensi/tindak-lanjut', label: 'Tindak Lanjut Keputusan', icon: CheckCircle2 },
        ],
      },
      {
        id: 'laporan', label: 'Laporan', icon: FileChartColumn,
        items: [
          { to: '/rekap', label: 'Rekap Keseluruhan', icon: ChartNoAxesColumn },
          { to: '/laporan-bulanan', label: 'Laporan Bulanan', icon: FileChartColumn },
        ],
      },
      {
        id: 'sistem', label: 'Sistem', icon: Settings,
        items: [
          { to: '/aktivitas', label: 'Riwayat Aktivitas', icon: Activity },
          { to: '/pengaturan', label: 'Pengaturan Admin', icon: Settings },
        ],
      },
    ]
  }

  return [
    {
      id: 'pengajian', label: 'Pengajian', icon: CalendarDays,
      items: [
        { to: '/jadwal', label: 'Jadwal Pengajian', icon: CalendarDays },
        { to: '/absensi', label: 'Absensi Kelas', icon: ClipboardCheck },
        { to: '/tindak-lanjut', label: 'Tindak Lanjut Absensi', icon: UserRoundCheck },
        { to: '/materi', label: 'Hasda & ASAD', icon: BookOpenCheck },
      ],
    },
      {
        id: 'jamaah', label: 'Warga', icon: Users,
        items: [
          { to: '/keluarga-wali', label: 'Keluarga & Wali', icon: ContactRound },
        ],
      },
      {
        id: 'musyawarah', label: 'Musyawarah', icon: FileText,
        items: [
          { to: '/notulensi', label: 'Notulensi', icon: FileText },
          { to: '/notulensi/tindak-lanjut', label: 'Tindak Lanjut Keputusan', icon: CheckCircle2 },
        ],
      },
    {
      id: 'laporan', label: 'Laporan', icon: FileChartColumn,
      items: [
        { to: '/rekap', label: 'Rekap Keseluruhan', icon: ChartNoAxesColumn },
        { to: '/laporan-bulanan', label: 'Laporan Bulanan', icon: FileChartColumn },
      ],
    },
  ]
}

function overflowGroups(groups: NavGroup[]): NavGroup[] {
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !BOTTOM_NAV_ROUTES.has(item.to)),
    }))
    .filter((group) => group.items.length > 0)
}

export function AppLayout() {
  const { user, signOut, isDemo } = useAuth()
  const { usingCachedData, lastSyncedAt, reload } = useData()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const online = useNetworkStatus()
  const { canInstall, install } = usePwaInstall()
  const groups = useMemo(() => navigationFor(user?.role ?? 'admin'), [user?.role])
  const moreGroups = useMemo(() => overflowGroups(groups), [groups])
  const activeGroup = groups.find((group) => group.items.some((item) => location.pathname === item.to))?.id ?? ''
  const [openGroup, setOpenGroup] = useState(activeGroup)

  const isMoreActive = useMemo(() => {
    return !BOTTOM_NAV_ROUTES.has(location.pathname) && !groups.some((g) => g.items.some((i) => location.pathname === i.to))
  }, [location.pathname, groups])

  const closeMore = useCallback(() => setMoreOpen(false), [])

  useEffect(() => {
    if (activeGroup) setOpenGroup(activeGroup)
  }, [activeGroup])

  return (
    <div className="app-shell">
      <button className="mobile-menu-button" type="button" onClick={() => setMobileOpen(true)} aria-label="Buka menu"><Menu size={20} /></button>
      {!online ? <div className="offline-banner"><WifiOff size={15} /> Offline · data terakhir tetap dapat dibuka, absensi disimpan sebagai draft</div> : null}
      {mobileOpen ? <div className="sidebar-overlay" onClick={() => setMobileOpen(false)} /> : null}
      <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <span className="brand-mark">SP</span>
          <span><strong>SASE Portal</strong><small>Administrasi warga pengajian</small></span>
          <button className="sidebar-close" type="button" onClick={() => setMobileOpen(false)}><X size={18} /></button>
        </div>
        <nav className="sidebar-nav">
          <NavLink to="/" end onClick={() => setMobileOpen(false)} className="sidebar-main-link"><LayoutDashboard size={18} /><span>Dashboard</span></NavLink>
          {groups.map((group) => {
            const GroupIcon = group.icon
            const expanded = openGroup === group.id
            const active = group.id === activeGroup
            return (
              <section className={`sidebar-nav-group ${active ? 'active' : ''}`} key={group.id}>
                <button type="button" className="sidebar-group-button" onClick={() => setOpenGroup(expanded ? '' : group.id)} aria-expanded={expanded}>
                  <GroupIcon size={18} /><span>{group.label}</span><ChevronDown className={expanded ? 'rotated' : ''} size={15} />
                </button>
                {expanded ? <div className="sidebar-subnav">{group.items.map(({ to, label, icon: Icon }) => (
                  <NavLink key={to} to={to} onClick={() => setMobileOpen(false)}><Icon size={15} /><span>{label}</span></NavLink>
                ))}</div> : null}
              </section>
            )
          })}
        </nav>
        <div className="sidebar-user">
          <div className={`connection-card ${online ? 'online' : 'offline'}`}>
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span><strong>{online ? (usingCachedData ? 'Menggunakan cache' : 'Terhubung') : 'Tidak ada koneksi'}</strong><small>{lastSyncedAt ? `Sinkron terakhir ${formatDateTime(lastSyncedAt)}` : 'Belum pernah sinkron'}</small></span>
            {online && usingCachedData ? <button type="button" onClick={() => void reload()}>Ulangi</button> : null}
          </div>
          {canInstall ? <button className="install-button" type="button" onClick={() => void install()}><Download size={16} /> Pasang di perangkat</button> : null}
          <div className="sidebar-user-title"><Users size={18} /><span><strong>{user?.name}</strong><small>{user?.role === 'superadmin' ? 'Akses seluruh kelas' : `${user?.assignedClassIds.length ?? 0} kelas diampu`}</small></span></div>
          {isDemo ? <span className="demo-pill">Mode demo</span> : null}
          <button type="button" onClick={() => void signOut()}><LogOut size={16} /> Keluar</button>
        </div>
      </aside>
      <main className={`app-main ${!online ? 'with-offline-banner' : ''}`}><Outlet /></main>
      <BottomNav onOpenMore={() => setMoreOpen(true)} isMoreActive={isMoreActive} />
      <MobileMoreMenu open={moreOpen} onClose={closeMore} groups={moreGroups} />
    </div>
  )
}
