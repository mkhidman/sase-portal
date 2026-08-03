import { Bold, Italic, List, ListOrdered, RotateCcw, Underline } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

const ALLOWED_TAGS = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'S', 'BR', 'UL', 'OL', 'LI', 'P', 'DIV'])

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
}

function sanitizeNode(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '')
  if (!(node instanceof Element)) return ''
  const children = Array.from(node.childNodes).map(sanitizeNode).join('')
  return ALLOWED_TAGS.has(node.tagName) ? `<${node.tagName.toLowerCase()}>${children}</${node.tagName.toLowerCase()}>` : children
}

export function sanitizeRichText(value: string): string {
  if (!value) return ''
  const template = document.createElement('template')
  template.innerHTML = value
  return Array.from(template.content.childNodes).map(sanitizeNode).join('')
}

export function plainTextFromRichText(value: string): string {
  const sanitized = sanitizeRichText(value)
  if (!sanitized) return ''
  const container = document.createElement('div')
  container.innerHTML = sanitized.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n')
  return (container.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
}

interface RichTextEditorProps {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  optional?: boolean
}

function ToolbarButton({ label, title, active = false, onClick, children }: { label: string; title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return <button className={`rich-text-tool ${active ? 'active' : ''}`} type="button" title={title} aria-label={label} aria-pressed={active} onMouseDown={(event) => event.preventDefault()} onClick={onClick}>{children}</button>
}

export function RichTextEditor({ label, value, onChange, placeholder, optional = false }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [activeFormats, setActiveFormats] = useState({ bold: false, italic: false, underline: false, unorderedList: false, orderedList: false })

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) editorRef.current.innerHTML = value
  }, [value])

  useEffect(() => {
    function refreshActiveFormats() {
      const editor = editorRef.current
      const selection = window.getSelection()
      if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) return
      setActiveFormats({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        unorderedList: document.queryCommandState('insertUnorderedList'),
        orderedList: document.queryCommandState('insertOrderedList'),
      })
    }
    document.addEventListener('selectionchange', refreshActiveFormats)
    return () => document.removeEventListener('selectionchange', refreshActiveFormats)
  }, [])

  function emitChange() {
    const next = editorRef.current?.innerHTML ?? ''
    onChange(next === '<br>' ? '' : next)
  }

  function command(name: string, commandValue?: string) {
    editorRef.current?.focus()
    document.execCommand(name, false, commandValue)
    emitChange()
    refreshActiveFormats()
  }

  function refreshActiveFormats() {
    const editor = editorRef.current
    const selection = window.getSelection()
    if (!editor || !selection?.anchorNode || !editor.contains(selection.anchorNode)) return
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      unorderedList: document.queryCommandState('insertUnorderedList'),
      orderedList: document.queryCommandState('insertOrderedList'),
    })
  }

  return (
    <div className="rich-text-field form-span-two">
      <label>{label} {optional ? <span className="field-help">(opsional)</span> : null}</label>
      <div className="rich-text-editor">
        <div className="rich-text-toolbar" role="toolbar" aria-label={`Format ${label}`}>
          <ToolbarButton label="Tebal" title="Tebal" active={activeFormats.bold} onClick={() => command('bold')}><Bold size={15} /></ToolbarButton>
          <ToolbarButton label="Miring" title="Miring" active={activeFormats.italic} onClick={() => command('italic')}><Italic size={15} /></ToolbarButton>
          <ToolbarButton label="Garis bawah" title="Garis bawah" active={activeFormats.underline} onClick={() => command('underline')}><Underline size={15} /></ToolbarButton>
          <span className="rich-text-divider" />
          <ToolbarButton label="Daftar berpoin" title="Daftar berpoin" active={activeFormats.unorderedList} onClick={() => command('insertUnorderedList')}><List size={15} /></ToolbarButton>
          <ToolbarButton label="Daftar bernomor" title="Daftar bernomor" active={activeFormats.orderedList} onClick={() => command('insertOrderedList')}><ListOrdered size={15} /></ToolbarButton>
          <ToolbarButton label="Hapus format" title="Hapus format" onClick={() => command('removeFormat')}><RotateCcw size={14} /></ToolbarButton>
        </div>
        <div ref={editorRef} className="rich-text-input" contentEditable suppressContentEditableWarning data-placeholder={placeholder} onInput={() => { emitChange(); refreshActiveFormats() }} onKeyUp={refreshActiveFormats} onMouseUp={refreshActiveFormats} onFocus={refreshActiveFormats} role="textbox" aria-multiline="true" />
      </div>
    </div>
  )
}

export function RichTextContent({ value, empty = 'Belum diisi.' }: { value: string; empty?: string }) {
  const html = sanitizeRichText(value)
  return html ? <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: html }} /> : <p className="field-help">{empty}</p>
}
