import { useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import type { ComponentType } from 'react'
import { Download, LogOut, Users, Wifi, WifiOff, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useData } from '../contexts/DataContext'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { usePwaInstall } from '../hooks/usePwaInstall'
import { formatDateTime } from '../lib/utils'

type NavItem = { to: string; label: string; icon: ComponentType<{ size?: number }> }
type NavGroup = { id: string; label: string; icon: ComponentType<{ size?: number }>; items: NavItem[] }

interface MobileMoreMenuProps {
  open: boolean
  onClose: () => void
  groups: NavGroup[]
}

export function MobileMoreMenu({ open, onClose, groups }: MobileMoreMenuProps) {
  const { user, signOut, isDemo } = useAuth()
  const { usingCachedData, lastSyncedAt, reload } = useData()
  const online = useNetworkStatus()
  const { canInstall, install } = usePwaInstall()

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="mobile-more-backdrop" onClick={onClose}>
      <div
        className="mobile-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi dan akun"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mobile-more-handle" />
        <div className="mobile-more-header">
          <strong>Navigasi</strong>
          <button type="button" className="mobile-more-close" onClick={onClose} aria-label="Tutup menu">
            <X size={18} />
          </button>
        </div>
        <div className="mobile-more-body">
          {groups.map((group) => {
            const GroupIcon = group.icon
            return (
              <section key={group.id} className="mobile-more-group">
                <div className="mobile-more-group-title">
                  <GroupIcon size={15} />
                  <span>{group.label}</span>
                </div>
                <div className="mobile-more-group-items">
                  {group.items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      onClick={onClose}
                      className={({ isActive }) => `mobile-more-item ${isActive ? 'active' : ''}`}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                    </NavLink>
                  ))}
                </div>
              </section>
            )
          })}

          <section className="mobile-more-account">
            <div className="mobile-more-group-title"><Users size={15} /><span>Akun</span></div>
            <div className="mobile-more-identity">
              <span className="mobile-more-avatar"><Users size={17} /></span>
              <span>
                <strong>{user?.name}</strong>
                <small>{user?.role === 'superadmin' ? 'Akses seluruh kelas' : `${user?.assignedClassIds.length ?? 0} kelas diampu`}</small>
              </span>
              {isDemo ? <span className="badge muted">Mode demo</span> : null}
            </div>

            <div className={`mobile-more-connection ${online ? 'online' : 'offline'}`}>
              {online ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span>
                <strong>{online ? (usingCachedData ? 'Menggunakan data tersimpan' : 'Terhubung') : 'Tidak ada koneksi'}</strong>
                <small>{lastSyncedAt ? `Sinkron terakhir ${formatDateTime(lastSyncedAt)}` : 'Belum pernah sinkron'}</small>
              </span>
              {online && usingCachedData ? <button className="button small outline" type="button" onClick={() => void reload()}>Ulangi</button> : null}
            </div>

            {canInstall ? (
              <button className="button outline full" type="button" onClick={() => void install()}>
                <Download size={16} /> Pasang di perangkat
              </button>
            ) : null}

            <button className="button danger full" type="button" onClick={() => void signOut()}>
              <LogOut size={16} /> Keluar
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
