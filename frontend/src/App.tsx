import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ApiError, askQuestion, deleteDocument, listDocuments, uploadDocument } from './api'
import type { ChatResponse, DocumentRecord } from './types'

const configuredUploadLimit = Number(import.meta.env.VITE_MAX_UPLOAD_BYTES || 20 * 1024 * 1024)
const MAX_UPLOAD_BYTES = Number.isFinite(configuredUploadLimit) && configuredUploadLimit > 0
  ? configuredUploadLimit
  : 20 * 1024 * 1024

interface Message {
  id: number
  role: 'user' | 'assistant'
  text: string
  result?: ChatResponse
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  const paths: Record<string, ReactNode> = {
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z"/></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></>,
    upload: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M20 16.5v2A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-2"/></>,
    send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
    trash: <><path d="M3 6h18M8 6V4h8v2m3 0-.8 14H5.8L5 6m4 4v6m6-6v6"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    close: <><path d="m18 6-12 12M6 6l12 12"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  }
  return <svg {...common}>{paths[name] ?? paths.file}</svg>
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusPill({ status }: { status: DocumentRecord['status'] }) {
  return <span className={`status-pill status-${status}`}><span className="status-dot" />{status}</span>
}

function CitationCard({ citation, index }: { citation: ChatResponse['citations'][number]; index: number }) {
  return (
    <details className="citation-card">
      <summary>
        <span className="citation-number">{index + 1}</span>
        <span className="citation-source"><strong>{citation.document_name}</strong><small>Page {citation.page_number}</small></span>
        <span className="citation-toggle">View passage</span>
      </summary>
      <blockquote>{citation.passage}</blockquote>
    </details>
  )
}

export function LegacyApp() {
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [documentsError, setDocumentsError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [question, setQuestion] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState('')
  const [deleteError, setDeleteError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const messageEnd = useRef<HTMLDivElement>(null)

  const refreshDocuments = useCallback(async (initial = false) => {
    if (initial) setDocumentsLoading(true)
    try {
      const rows = await listDocuments()
      setDocuments(rows)
      setDocumentsError('')
    } catch (error) {
      setDocumentsError(error instanceof Error ? error.message : 'Could not load documents.')
    } finally {
      if (initial) setDocumentsLoading(false)
    }
  }, [])

  useEffect(() => { void refreshDocuments(true) }, [refreshDocuments])
  useEffect(() => {
    if (!documents.some((document) => document.status === 'processing')) return
    const timer = window.setInterval(() => void refreshDocuments(), 2500)
    return () => window.clearInterval(timer)
  }, [documents, refreshDocuments])
  useEffect(() => { messageEnd.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }) }, [messages, chatLoading])

  async function handleFile(file?: File) {
    if (!file) return
    setUploadError('')
    if (file.type !== 'application/pdf') {
      setUploadError('Choose a PDF file to upload.')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setUploadError(`This file exceeds the ${formatSize(MAX_UPLOAD_BYTES)} upload limit.`)
      return
    }
    setUploadProgress(0)
    try {
      await uploadDocument(file, setUploadProgress)
      await refreshDocuments()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The PDF could not be uploaded.')
      await refreshDocuments()
    } finally {
      setUploadProgress(null)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = question.trim()
    if (!text || chatLoading) return
    setQuestion('')
    setChatError('')
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text }])
    setChatLoading(true)
    try {
      const result = await askQuestion(text)
      setMessages((current) => [...current, { id: Date.now() + 1, role: 'assistant', text: result.answer, result }])
    } catch (error) {
      setChatError(error instanceof ApiError && error.status === 503
        ? 'The AI providers are not configured yet. Add provider settings to .env and restart the backend.'
        : error instanceof Error ? error.message : 'Your question could not be answered.')
    } finally {
      setChatLoading(false)
    }
  }

  async function handleDelete(document: DocumentRecord) {
    if (!window.confirm(`Delete “${document.filename}” and its indexed passages?`)) return
    setDeleteError('')
    try {
      await deleteDocument(document.id)
      setDocuments((current) => current.filter((item) => item.id !== document.id))
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'The document could not be deleted.')
    }
  }

  const processedCount = documents.filter((document) => document.status === 'processed').length

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#home" aria-label="Northstar home">
          <span className="brand-mark"><Icon name="sparkle" size={22} /></span>
          <span className="brand-name">northstar<span>knowledge agent</span></span>
        </a>

        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-card"><span className="workspace-avatar">NS</span><span><strong>Demo workspace</strong><small>Single-user local</small></span><span className="workspace-chevron">⌄</span></div>

        <div className="library-heading"><span>YOUR LIBRARY</span><span className="count-badge">{documents.length}</span></div>
        <button className="upload-button" onClick={() => fileInput.current?.click()} disabled={uploadProgress !== null}>
          <Icon name="plus" size={17} /> Add documents
        </button>
        <input
          ref={fileInput}
          className="visually-hidden"
          type="file"
          accept="application/pdf,.pdf"
          aria-label="Choose a PDF document"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />

        {uploadProgress !== null && (
          <div className="upload-progress" role="status" aria-live="polite">
            <div className="upload-progress-copy"><span>Uploading PDF</span><strong>{uploadProgress}%</strong></div>
            <div className="progress-track"><div className="progress-value" style={{ width: `${uploadProgress}%` }} /></div>
            <small>Processing and indexing document…</small>
          </div>
        )}
        {uploadError && <div className="inline-error" role="alert">{uploadError}</div>}
        {deleteError && <div className="inline-error" role="alert">{deleteError}</div>}
        {documentsError && <div className="inline-error" role="alert">{documentsError}<button className="text-button" onClick={() => void refreshDocuments(true)}>Retry</button></div>}

        <div className="document-list" aria-label="Uploaded documents">
          {documentsLoading ? <div className="sidebar-empty"><span className="skeleton-line" /><span className="skeleton-line short" /></div> : documents.length === 0 ? (
            <div className="sidebar-empty"><span className="empty-icon"><Icon name="file" size={19} /></span><span>No documents yet</span><small>Add a PDF to get started</small></div>
          ) : documents.map((document) => (
            <div className="document-row" key={document.id}>
              <span className="pdf-icon">PDF</span>
              <span className="document-meta"><strong title={document.filename}>{document.filename}</strong><small>{document.status === 'processed' ? `${document.page_count} pages · ${formatSize(document.size_bytes)}` : document.status}</small></span>
              <StatusPill status={document.status} />
              <button className="icon-button delete-button" aria-label={`Delete ${document.filename}`} title="Delete document" onClick={() => void handleDelete(document)}><Icon name="trash" size={15} /></button>
            </div>
          ))}
        </div>

        <div className="sidebar-footer"><span className="online-dot" /> Local development <span className="footer-version">v0.1</span></div>
      </aside>

      <main className="main-panel" id="home">
        <header className="topbar"><div className="breadcrumb">Workspace <Icon name="arrow" size={14} /> <strong>Ask your documents</strong></div><div className="topbar-right"><span className="privacy-label"><Icon name="book" size={15} /> Single-user demo</span><span className="user-avatar">JD</span></div></header>

        <section className={`chat-stage ${messages.length ? 'has-messages' : ''}`} aria-label="Document chat">
          {messages.length === 0 ? (
            <div className="welcome-panel">
              <div className="welcome-icon"><Icon name="sparkle" size={25} /></div>
              <div className="eyebrow">YOUR COMPANY KNOWLEDGE, CONNECTED</div>
              <h1>Answers you can<br /><em>trace back to source.</em></h1>
              <p>Ask a question across your documents. Every answer comes with the passages that support it.</p>
              <div className="prompt-label">TRY ASKING</div>
              <div className="suggestion-grid">
                {['What is our standard contract renewal period?', 'Summarize the latest travel expense policy', 'What are the data retention requirements?'].map((suggestion) => (
                  <button className="suggestion" key={suggestion} onClick={() => setQuestion(suggestion)}><span>{suggestion}</span><Icon name="arrow" size={16} /></button>
                ))}
              </div>
              {documents.length === 0 && <div className="welcome-hint"><Icon name="upload" size={16} /> Upload a PDF to begin asking questions.</div>}
              {documents.length > 0 && processedCount === 0 && <div className="welcome-hint"><span className="spinner small" /> Your documents are still processing.</div>}
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message) => (
                <article className={`message message-${message.role}`} key={message.id}>
                  <div className={`message-avatar ${message.role === 'assistant' ? 'assistant-avatar' : ''}`}>{message.role === 'assistant' ? <Icon name="sparkle" size={16} /> : 'JD'}</div>
                  <div className="message-content">
                    <div className="message-author">{message.role === 'assistant' ? 'Northstar' : 'You'}<span>{message.role === 'assistant' ? 'AI KNOWLEDGE AGENT' : 'JUST NOW'}</span></div>
                    <p>{message.text}</p>
                    {message.result?.metrics && <div className="agent-metrics">Search: {message.result.metrics.search_tools.join(' → ')} <span>·</span> {message.result.metrics.latency_ms} ms <span>·</span> {message.result.metrics.llm_calls} model {message.result.metrics.llm_calls === 1 ? 'call' : 'calls'}</div>}
                    {message.result?.abstained && <div className="answer-notice abstain-notice"><span>!</span><span><strong>Insufficient evidence</strong><small>The uploaded documents did not contain enough evidence to support an answer.</small></span></div>}
                    {message.result?.conflicting_evidence && <div className="answer-notice conflict-notice"><span>↔</span><span><strong>Conflicting evidence found</strong><small>The cited passages disagree. Review both sources before deciding.</small></span></div>}
                    {!!message.result?.citations.length && <div className="citations-section"><div className="citations-heading"><span>SUPPORTING SOURCES</span><span>{message.result.citations.length} {message.result.citations.length === 1 ? 'citation' : 'citations'}</span></div>{message.result.citations.map((citation, index) => <CitationCard key={`${citation.chunk_id}-${index}`} citation={citation} index={index} />)}</div>}
                  </div>
                </article>
              ))}
              {chatLoading && <div className="message message-assistant"><div className="message-avatar assistant-avatar"><Icon name="sparkle" size={16} /></div><div className="message-content"><div className="message-author">Northstar<span>SEARCHING YOUR DOCUMENTS</span></div><div className="thinking-indicator"><span /><span /><span /></div></div></div>}
              {chatError && <div className="chat-error" role="alert"><span>{chatError}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setChatError('')}><Icon name="close" size={16} /></button></div>}
              <div ref={messageEnd} />
            </div>
          )}
        </section>

        <footer className="composer-area">
          <form className="composer" onSubmit={(event) => void handleQuestion(event)}>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask anything about your documents…" aria-label="Ask a question about your documents" maxLength={4000} disabled={chatLoading} />
            <div className="composer-bottom"><span className="composer-hint"><Icon name="sparkle" size={14} /> Answers are grounded in your uploaded sources</span><div className="composer-actions"><span className="character-count">{question.length ? `${question.length}/4000` : ''}</span><button className="send-button" type="submit" aria-label="Send question" disabled={!question.trim() || chatLoading}><span>Ask</span><Icon name="send" size={15} /></button></div></div>
          </form>
          <div className="disclaimer">AI can make mistakes. Verify important information against the cited source documents.</div>
        </footer>
      </main>
    </div>
  )
}

export { default } from './NorthstarApp'
