import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Modal } from './Modal'

export interface ConfirmOptions {
  title: string
  description: ReactNode
  confirmLabel: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
}

// Pengganti window.confirm: dialog bawaan browser tidak dapat digaya, tidak mengikuti
// bahasa aplikasi, dan pada sebagian in-app browser bisa diabaikan begitu saja.
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolveRef.current = resolve
    setRequest(options)
  }), [])

  const settle = useCallback((value: boolean) => {
    const resolve = resolveRef.current
    resolveRef.current = null
    setRequest(null)
    resolve?.(value)
  }, [])

  const dialog = request ? (
    <Modal
      open
      title={request.title}
      onClose={() => settle(false)}
      footer={<>
        <button className="button outline" type="button" onClick={() => settle(false)}>{request.cancelLabel ?? 'Batal'}</button>
        <button className={`button ${request.tone ?? 'primary'}`} type="button" onClick={() => settle(true)}>{request.confirmLabel}</button>
      </>}
    >
      <p className="modal-help">{request.description}</p>
    </Modal>
  ) : null

  return { confirm, dialog }
}
