import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

const GAP = 6
const EDGE = 8

export interface PanelAnchor {
  top: number
  left: number
}

/**
 * Panel pemilih digambar lewat portal ke <body> dengan posisi fixed, bukan
 * sebagai anak pemicunya.
 *
 * Sebabnya tiga pemotong yang semuanya ada di aplikasi ini dan tidak bisa
 * dihindari dari dalam: `.modal-card` memakai `overflow: auto`, tiap anak
 * `.app-main` membawa transform sisa animasi `riseIn` sehingga jadi konteks
 * penumpukan sendiri, dan tabel panjang punya wadah bergulirnya sendiri. Panel
 * yang bersarang di dalam pemicunya akan terpotong oleh salah satu dari ketiganya
 * tergantung di halaman mana ia dipakai -- dan itu baru ketahuan satu per satu.
 */
export function usePickerPanel(panelHeight: number, panelWidth: number) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<PanelAnchor>({ top: 0, left: 0 })
  const wrapper = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)

  const close = useCallback(() => setOpen(false), [])

  const reposition = useCallback(() => {
    const trigger = wrapper.current?.getBoundingClientRect()
    if (!trigger) return
    const height = panel.current?.offsetHeight || panelHeight
    const width = panel.current?.offsetWidth || panelWidth
    const spaceBelow = window.innerHeight - trigger.bottom - EDGE
    const top = spaceBelow >= height || trigger.top - EDGE < height
      ? Math.min(trigger.bottom + GAP, window.innerHeight - height - EDGE)
      : trigger.top - GAP - height
    const left = Math.min(Math.max(EDGE, trigger.left), window.innerWidth - width - EDGE)
    setAnchor({ top: Math.max(EDGE, top), left })
  }, [panelHeight, panelWidth])

  useLayoutEffect(() => {
    if (!open) return
    reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (wrapper.current?.contains(target) || panel.current?.contains(target)) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    // Capture: panel harus ikut bergerak walau yang bergulir wadah di dalam halaman.
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, reposition])

  return { open, setOpen, close, anchor, wrapper, panel, reposition }
}
