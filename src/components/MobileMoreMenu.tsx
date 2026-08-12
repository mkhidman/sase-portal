import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import type { ComponentType } from 'react'
import { X } from 'lucide-react'

type NavItem = { to: string; label: string; icon: ComponentType<{ size?: number }> }
type NavGroup = { id: string; label: string; icon: ComponentType<{ size?: number }>; items: NavItem[] }

interface MobileMoreMenuProps {
  open: boolean
  onClose: () => void
  groups: NavGroup[]
}

export function MobileMoreMenu({ open, onClose, groups }: MobileMoreMenuProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

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
    <div className="mobile-more-backdrop" onClick={onClose} role="dialog" aria-label="Menu navigasi">
      <div
        ref={sheetRef}
        className="mobile-more-sheet"
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
        </div>
      </div>
    </div>
  )
}
