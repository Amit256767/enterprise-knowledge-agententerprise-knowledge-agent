import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ApiError, askQuestion, deleteDocument, listDocuments, uploadDocument } from './api'
import { CitationCard } from './components/CitationCard'
import { FormattedAnswer } from './components/FormattedAnswer'
import { Icon, type IconName } from './components/Icon'
import { UploadDropzone } from './components/UploadDropzone'
import type { ChatResponse, DocumentRecord } from './types'

type View = 'ask' | 'documents' | 'history' | 'settings'
type Message = { id: number; role: 'user' | 'assistant'; text: string; result?: ChatResponse }

const configuredUploadLimit = Number(import.meta.env.VITE_MAX_UPLOAD_BYTES || 20 * 1024 * 1024)
const MAX_UPLOAD_BYTES = Number.isFinite(configuredUploadLimit) && configuredUploadLimit > 0
  ? configuredUploadLimit
  : 20 * 1024 * 1024

const starterQuestions = [
  'What are the data retention requirements?',
  'Summarize the latest travel expense policy.',
  'What is our standard contract renewal period?',
]

const navigation: Array<{ id: View; label: string; icon: IconName }> = [
  { id: 'ask', label: 'Ask documents', icon: 'message' },
  { id: 'documents', label: 'Documents', icon: 'files' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ status }: { status: DocumentRecord['status'] }) {
  return <span className={`status-badge status-${status}`}><span className="status-dot" />{status}</span>
}

function DocumentRow({ document, onDelete }: { document: DocumentRecord; onDelete: (document: DocumentRecord) => void }) {
  return (
    <article className="document-row">
      <span className="document-file-icon"><Icon name="file" size={18} /><span>PDF</span></span>
      <span className="document-meta">
        <strong title={document.filename}>{document.filename}</strong>
        <small>{document.status === 'processed' ? `${document.page_count} pages · ${formatSize(document.size_bytes)}` : formatSize(document.size_bytes)}</small>
      </span>
      <StatusBadge status={document.status} />
      <button className="icon-button document-delete" type="button" aria-label={`Delete ${document.filename}`} title="Delete document" onClick={() => onDelete(document)}>
        <Icon name="trash" size={16} />
      </button>
    </article>
  )
}

function SourcePanel({ message }: { message?: Message }) {
  const citations = message?.result?.citations ?? []
  return (
    <section className="rail-card sources-card" aria-labelledby="sources-heading">
      <div className="rail-card-heading">
        <span className="rail-icon rail-icon-violet"><Icon name="book" size={17} /></span>
        <div><h2 id="sources-heading">Sources &amp; citations</h2><p>Evidence returned with your answer</p></div>
      </div>
      {citations.length ? (
        <div className="source-list">
          {citations.map((citation, index) => (
            <CitationCard key={`${citation.chunk_id}-${index}`} citation={citation} index={index} id={`rail-source-${message?.id}-${index}`} variant="source-panel" />
          ))}
        </div>
      ) : message?.result?.abstained ? (
        <div className="source-empty source-empty-notice"><span className="source-empty-icon"><Icon name="warning" size={17} /></span><strong>No supporting passage found</strong><span>The answer reports insufficient evidence. No source has been added here.</span></div>
      ) : (
        <div className="source-empty"><span className="source-empty-icon"><Icon name="search" size={18} /></span><strong>{message ? 'No citations returned' : 'Your evidence will appear here'}</strong><span>{message ? 'This response did not include source passages.' : 'Ask a question to see the document passages behind an answer.'}</span></div>
      )}
      <div className="preview-note"><Icon name="shield" size={14} /><span>Passages are shown exactly as provided by the knowledge agent.</span></div>
    </section>
  )
}

function RightRail({ documents, latestAnswer, onQuestion }: { documents: DocumentRecord[]; latestAnswer?: Message; onQuestion: (question: string) => void }) {
  const processed = documents.filter((document) => document.status === 'processed').length
  return (
    <aside className="right-rail" aria-label="Sources and workspace details">
      <SourcePanel message={latestAnswer} />
      <section className="rail-card library-card" aria-labelledby="library-heading">
        <div className="rail-card-heading">
          <span className="rail-icon rail-icon-blue"><Icon name="files" size={17} /></span>
          <div><h2 id="library-heading">Your library</h2><p>{documents.length} {documents.length === 1 ? 'document' : 'documents'} · {processed} ready</p></div>
        </div>
        {!documents.length ? (
          <div className="library-empty"><Icon name="file" size={17} /><span>No documents yet</span></div>
        ) : (
          <ul className="library-mini-list">
            {documents.slice(0, 4).map((document) => (
              <li key={document.id}>
                <span className="mini-file"><Icon name="file" size={15} /></span>
                <span className="mini-file-copy"><strong title={document.filename}>{document.filename}</strong><small>{document.status === 'processed' ? `${document.page_count} pages` : document.status}</small></span>
                <span className={`mini-status mini-status-${document.status}`} aria-label={document.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rail-card prompt-card" aria-labelledby="prompt-heading">
        <div className="prompt-card-top"><Icon name="sparkle" size={16} /><span id="prompt-heading">Question ideas</span></div>
        <p>Example prompts to explore your documents.</p>
        <div className="rail-question-list">
          {starterQuestions.slice(0, 2).map((question) => <button type="button" key={question} onClick={() => onQuestion(question)}>{question}<Icon name="arrow" size={13} /></button>)}
        </div>
      </section>
    </aside>
  )
}

function EmptyWelcome({ onQuestion, onBrowse, onFile, progress, hasDocuments, documentsProcessing }: {
  onQuestion: (question: string) => void
  onBrowse: () => void
  onFile: (file?: File) => void
  progress: number | null
  hasDocuments: boolean
  documentsProcessing: boolean
}) {
  return (
    <div className="welcome-layout">
      <section className="welcome-card">
        <div className="welcome-kicker"><span className="kicker-sparkle"><Icon name="sparkle" size={15} /></span> KNOWLEDGE, CONNECTED</div>
        <h2>Answers with<br /><span>evidence built in.</span></h2>
        <p>Search across your company PDFs and follow every answer back to the passages that support it.</p>
        <div className="welcome-trust"><span><Icon name="shield" size={15} /> Source-grounded responses</span><i /> <span>Private workspace</span></div>
      </section>
      <UploadDropzone onBrowse={onBrowse} onFile={onFile} progress={progress} />
      {!hasDocuments && (
        <div className="upload-empty-note"><span className="note-symbol"><Icon name="file" size={17} /></span><span><strong>Your library starts here</strong><small>Only documents you upload are used to answer questions.</small></span></div>
      )}
      {hasDocuments && documentsProcessing && (
        <div className="processing-note" role="status"><span className="processing-spinner" /> Your documents are still being indexed.</div>
      )}
      <section className="starter-section" aria-labelledby="starter-heading">
        <div className="section-eyebrow" id="starter-heading">QUESTIONS TO GET YOU STARTED</div>
        <div className="starter-grid">
          {starterQuestions.map((question, index) => (
            <button className="starter-question" type="button" key={question} onClick={() => onQuestion(question)}>
              <span className={`starter-index starter-index-${index + 1}`}>0{index + 1}</span><span>{question}</span><Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

function Conversation({ messages, loading, error, onDismissError, endRef }: {
  messages: Message[]
  loading: boolean
  error: string
  onDismissError: () => void
  endRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <section className="conversation-card" aria-label="Document conversation">
      <div className="conversation-toolbar"><span className="conversation-title"><span className="conversation-live-dot" /> Current conversation</span><span className="conversation-source-note"><Icon name="shield" size={14} /> Evidence-first answers</span></div>
      <div className="message-list" role="log" aria-live="polite" aria-relevant="additions text">
        {messages.map((message) => (
          <article className={`message message-${message.role}`} key={message.id}>
            <div className={`message-avatar ${message.role === 'assistant' ? 'assistant-avatar' : 'user-avatar'}`}>{message.role === 'assistant' ? <Icon name="sparkle" size={17} /> : 'You'}</div>
            <div className="message-content">
              <div className="message-author">{message.role === 'assistant' ? 'Northstar' : 'You'}<span>{message.role === 'assistant' ? 'KNOWLEDGE AGENT' : 'YOUR QUESTION'}</span></div>
              {message.role === 'user' ? <p className="user-question">{message.text}</p> : (
                <>
                  <FormattedAnswer text={message.text} citationPrefix={`source-${message.id}`} citationCount={message.result?.citations.length ?? 0} />
                  {message.result?.abstained && <div className="answer-notice abstain-notice"><span className="notice-icon"><Icon name="warning" size={16} /></span><span><strong>Insufficient evidence</strong><small>The uploaded documents did not contain enough evidence to support an answer.</small></span></div>}
                  {message.result?.conflicting_evidence && <div className="answer-notice conflict-notice"><span className="notice-icon"><Icon name="warning" size={16} /></span><span><strong>Conflicting evidence found</strong><small>The cited passages disagree. Review both sources before deciding.</small></span></div>}
                  {message.result?.metrics && <div className="agent-metrics">Search path: {message.result.metrics.search_tools.join(' → ')} <span>·</span> {message.result.metrics.latency_ms} ms <span>·</span> {message.result.metrics.llm_calls} model {message.result.metrics.llm_calls === 1 ? 'call' : 'calls'}</div>}
                  {!!message.result?.citations.length && (
                    <div className="citations-section">
                      <div className="citations-heading"><span>SUPPORTING PASSAGES</span><span>{message.result.citations.length} {message.result.citations.length === 1 ? 'source' : 'sources'}</span></div>
                      {message.result.citations.map((citation, index) => <CitationCard key={`${citation.chunk_id}-${index}`} citation={citation} index={index} id={`source-${message.id}-${index}`} />)}
                    </div>
                  )}
                </>
              )}
            </div>
          </article>
        ))}
        {loading && <article className="message message-assistant"><div className="message-avatar assistant-avatar"><Icon name="sparkle" size={17} /></div><div className="message-content"><div className="message-author">Northstar<span>SEARCHING YOUR DOCUMENTS</span></div><div className="thinking-indicator" role="status" aria-label="Searching documents"><span /><span /><span /></div></div></article>}
        {error && <div className="chat-error" role="alert"><span>{error}</span><button className="icon-button" type="button" aria-label="Dismiss error" onClick={onDismissError}><Icon name="close" size={16} /></button></div>}
        <div ref={endRef} />
      </div>
    </section>
  )
}

function DocumentLibrary({ documents, loading, error, onRetry, onDelete, onBrowse, onFile, progress }: {
  documents: DocumentRecord[]
  loading: boolean
  error: string
  onRetry: () => void
  onDelete: (document: DocumentRecord) => void
  onBrowse: () => void
  onFile: (file?: File) => void
  progress: number | null
}) {
  return (
    <div className="document-view">
      <UploadDropzone onBrowse={onBrowse} onFile={onFile} progress={progress} compact />
      <section className="document-library-card">
        <div className="library-view-heading"><div><div className="section-eyebrow">WORKSPACE LIBRARY</div><h2>All documents</h2><p>Manage the PDFs connected to your knowledge agent.</p></div><span className="library-total">{documents.length} {documents.length === 1 ? 'file' : 'files'}</span></div>
        {error && <div className="inline-error" role="alert">{error}<button type="button" className="text-button" onClick={onRetry}>Try again</button></div>}
        {loading ? <div className="library-loading" role="status"><span className="processing-spinner" /> Loading your documents…</div> : documents.length ? (
          <div className="document-table" aria-label="Uploaded documents">
            <div className="document-table-head"><span>DOCUMENT</span><span>STATUS</span><span>ACTION</span></div>
            {documents.map((document) => <DocumentRow key={document.id} document={document} onDelete={onDelete} />)}
          </div>
        ) : (
          <div className="document-empty"><span className="document-empty-icon"><Icon name="files" size={22} /></span><h3>No documents yet</h3><p>Upload a text-based PDF to make it searchable in your workspace.</p><button className="button button-gradient" type="button" onClick={onBrowse}><Icon name="upload" size={16} /> Upload a PDF</button></div>
        )}
      </section>
    </div>
  )
}

function HistoryView({ messages, onReturn }: { messages: Message[]; onReturn: () => void }) {
  const questions = messages.filter((message) => message.role === 'user')
  return (
    <section className="simple-view-card">
      <div className="section-eyebrow">CURRENT SESSION</div><h2>Conversation history</h2><p>Questions from this browser session. Conversations are not saved by the current backend.</p>
      {questions.length ? <div className="history-list">{questions.map((message, index) => <button className="history-item" key={message.id} type="button" onClick={onReturn}><span className="history-item-icon"><Icon name="message" size={17} /></span><span><strong>{message.text}</strong><small>Current session · Question {index + 1}</small></span><Icon name="arrow" size={16} /></button>)}</div> : <div className="simple-empty"><span className="simple-empty-icon"><Icon name="history" size={21} /></span><strong>No questions in this session</strong><span>When you ask about your documents, your current session will appear here.</span><button type="button" className="button button-secondary" onClick={onReturn}>Start asking</button></div>}
    </section>
  )
}

function SettingsView() {
  return (
    <section className="simple-view-card settings-view">
      <div className="section-eyebrow">WORKSPACE PREFERENCES</div><h2>Settings</h2><p>Configuration stays with the local backend and environment files.</p>
      <div className="settings-list">
        <article className="settings-row"><span className="settings-row-icon"><Icon name="upload" size={18} /></span><span><strong>PDF upload limit</strong><small>Browser-side file validation limit</small></span><b>{formatSize(MAX_UPLOAD_BYTES)}</b></article>
        <article className="settings-row"><span className="settings-row-icon"><Icon name="external" size={18} /></span><span><strong>API connection</strong><small>Local Vite proxy forwards /api requests to FastAPI.</small></span><b>Local</b></article>
        <article className="settings-row"><span className="settings-row-icon"><Icon name="shield" size={18} /></span><span><strong>Provider credentials</strong><small>Embedding and chat keys belong in the backend .env file.</small></span><b>Backend only</b></article>
        <article className="settings-row"><span className="settings-row-icon"><Icon name="file" size={18} /></span><span><strong>Supported documents</strong><small>Text-based PDFs. Scanned image PDFs need OCR, which this app does not provide.</small></span><b>PDF</b></article>
      </div>
      <div className="settings-security"><Icon name="shield" size={17} /><span><strong>Secrets stay server-side</strong><small>This interface does not read, store, or display provider API keys.</small></span></div>
    </section>
  )
}

export default function NorthstarApp() {
  const [view, setView] = useState<View>('ask')
  const [documents, setDocuments] = useState<DocumentRecord[]>([])
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [documentsError, setDocumentsError] = useState('')
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
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
    setUploadSuccess('')
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
      const uploaded = await uploadDocument(file, setUploadProgress)
      setUploadSuccess(`${uploaded.filename} was uploaded successfully.`)
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
    setMessages((current) => [...current, { id: Date.now() + current.length, role: 'user', text }])
    setChatLoading(true)
    try {
      const result = await askQuestion(text)
      setMessages((current) => [...current, { id: Date.now() + current.length, role: 'assistant', text: result.answer, result }])
    } catch (error) {
      setChatError(error instanceof ApiError && error.status === 503
        ? 'The AI providers are not configured yet. Add provider settings to the backend .env and restart the API.'
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

  const latestAnswer = useMemo(() => [...messages].reverse().find((message) => message.role === 'assistant'), [messages])
  const documentsProcessing = documents.some((document) => document.status === 'processing')
  const pageCopy: Record<View, { title: string; subtitle: string }> = {
    ask: { title: 'Ask your documents', subtitle: 'Search your knowledge base and trace answers back to their sources.' },
    documents: { title: 'Your documents', subtitle: 'Manage the PDFs connected to your knowledge workspace.' },
    history: { title: 'Conversation history', subtitle: 'Return to questions from your current session.' },
    settings: { title: 'Workspace settings', subtitle: 'Review local upload and privacy configuration.' },
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#workspace" onClick={(event) => { event.preventDefault(); setView('ask') }} aria-label="Northstar Knowledge Agent home">
          <span className="brand-mark"><Icon name="sparkle" size={22} /></span>
          <span className="brand-name">northstar<span>KNOWLEDGE AGENT</span></span>
        </a>
        <div className="sidebar-workspace-label">WORKSPACE</div>
        <div className="workspace-switcher"><span className="workspace-avatar">N</span><span><strong>Northstar workspace</strong><small>Private · Local session</small></span><Icon name="chevron" size={16} /></div>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <button key={item.id} type="button" className={`nav-item${view === item.id ? ' is-active' : ''}`} aria-current={view === item.id ? 'page' : undefined} onClick={() => setView(item.id)}>
              <Icon name={item.icon} size={18} /><span>{item.label}</span>{item.id === 'documents' && <span className="nav-count">{documents.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-library-label"><span>YOUR LIBRARY</span><span className="library-count">{documents.length}</span></div>
        <button className="sidebar-upload" type="button" disabled={uploadProgress !== null} onClick={() => fileInput.current?.click()}><Icon name="plus" size={16} /> Add documents</button>
        {documentsError && <div className="sidebar-error" role="alert">{documentsError}<button type="button" onClick={() => void refreshDocuments(true)}>Retry</button></div>}
        {deleteError && <div className="sidebar-error" role="alert">{deleteError}</div>}
        {uploadError && <div className="sidebar-error" role="alert">{uploadError}<button type="button" onClick={() => setUploadError('')} aria-label="Dismiss upload error"><Icon name="close" size={13} /></button></div>}
        {uploadSuccess && <div className="sidebar-success" role="status"><Icon name="check" size={14} /> {uploadSuccess}<button type="button" onClick={() => setUploadSuccess('')} aria-label="Dismiss upload message"><Icon name="close" size={13} /></button></div>}
        <div className="sidebar-bottom">
          <div className="profile-card"><span className="profile-avatar">N</span><span><strong>Northstar workspace</strong><small>Local knowledge agent</small></span><span className="profile-presence" aria-label="Local session" /></div>
          <div className="sidebar-privacy"><Icon name="shield" size={14} /><span>Documents stay in your workspace</span></div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-divider">/</span><strong>{pageCopy[view].title}</strong></div>
          <div className="topbar-actions"><span className="session-pill"><span /> Private session</span><button className="topbar-upload" type="button" onClick={() => fileInput.current?.click()} disabled={uploadProgress !== null}><Icon name="upload" size={16} /><span>Upload PDF</span></button></div>
        </header>
        <input ref={fileInput} className="visually-hidden" type="file" accept="application/pdf,.pdf" aria-label="Choose a PDF document" onChange={(event) => void handleFile(event.target.files?.[0])} />

        <main className="workspace-main" id="workspace">
          <div className="page-heading"><div><div className="page-eyebrow">NORTHSTAR KNOWLEDGE WORKSPACE</div><h1>{pageCopy[view].title}</h1><p>{pageCopy[view].subtitle}</p></div><div className="heading-decoration"><span className="decor-orb decor-orb-blue" /><span className="decor-orb decor-orb-violet" /><span className="decor-grid" /></div></div>
          <div className="workspace-grid">
            <section className="primary-column" aria-label={pageCopy[view].title}>
              {view === 'ask' && (
                <>
                  {messages.length === 0 ? <EmptyWelcome onQuestion={setQuestion} onBrowse={() => fileInput.current?.click()} onFile={(file) => void handleFile(file)} progress={uploadProgress} hasDocuments={documents.length > 0} documentsProcessing={documentsProcessing} /> : <><UploadDropzone onBrowse={() => fileInput.current?.click()} onFile={(file) => void handleFile(file)} progress={uploadProgress} compact /><Conversation messages={messages} loading={chatLoading} error={chatError} onDismissError={() => setChatError('')} endRef={messageEnd} /></>}
                  <footer className="composer-area">
                    <form className="composer" onSubmit={(event) => void handleQuestion(event)}>
                      <label className="composer-label" htmlFor="document-question">Your question</label>
                      <textarea id="document-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question across your PDFs…" aria-label="Ask a question about your documents" maxLength={4000} disabled={chatLoading} rows={2} />
                      <div className="composer-bottom"><span className="composer-hint"><Icon name="sparkle" size={15} /> Answers are grounded in your uploaded sources</span><div className="composer-actions"><span className="character-count">{question.length ? `${question.length}/4000` : ''}</span><button className="send-button" type="submit" aria-label="Send question" disabled={!question.trim() || chatLoading}><span>{chatLoading ? 'Searching' : 'Ask Northstar'}</span><Icon name="send" size={16} /></button></div></div>
                    </form>
                    <div className="disclaimer">AI can make mistakes. Verify important information against the cited source documents.</div>
                  </footer>
                </>
              )}
              {view === 'documents' && <DocumentLibrary documents={documents} loading={documentsLoading} error={documentsError} onRetry={() => void refreshDocuments(true)} onDelete={(document) => void handleDelete(document)} onBrowse={() => fileInput.current?.click()} onFile={(file) => void handleFile(file)} progress={uploadProgress} />}
              {view === 'history' && <HistoryView messages={messages} onReturn={() => setView('ask')} />}
              {view === 'settings' && <SettingsView />}
            </section>
            <RightRail documents={documents} latestAnswer={latestAnswer} onQuestion={(nextQuestion) => { setView('ask'); setQuestion(nextQuestion) }} />
          </div>
        </main>
      </div>
    </div>
  )
}
