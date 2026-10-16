import { afterEach, describe, expect, it, vi } from 'vitest'
import { askQuestion, uploadDocument } from './api'
import type { ChatResponse } from './types'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('API request contracts', () => {
  it('sends chat as JSON to the backend chat route', async () => {
    const result: ChatResponse = {
      answer: 'The policy states five years.',
      abstained: false,
      conflicting_evidence: false,
      citations: [{
        chunk_id: 'chunk-id',
        document_id: 'document-id',
        document_name: 'policy.pdf',
        page_number: 2,
        passage: 'The retention period is five years.',
      }],
      retrieved_sources: [],
      metrics: null,
    }
    const response = { ok: true, status: 200, json: vi.fn().mockResolvedValue(result) }
    const fetchMock = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(askQuestion('How long?')).resolves.toEqual(result)

    expect(fetchMock).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'How long?' }),
    }))
  })

  it('uploads the PDF in the backend multipart file field', async () => {
    let xhrInstance: MockXMLHttpRequest | undefined
    class MockXMLHttpRequest {
      upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null }
      status = 201
      responseText = JSON.stringify({
        id: 'document-id', filename: 'policy.pdf', size_bytes: 4,
        status: 'processed', page_count: 1, error_message: null,
      })
      timeout = 0
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      ontimeout: (() => void) | null = null
      openedWith: unknown[] = []
      sentBody: FormData | null = null
      headers: unknown[] = []

      constructor() { xhrInstance = this }
      open(...args: unknown[]) { this.openedWith = args }
      setRequestHeader(...args: unknown[]) { this.headers = args }
      send(body: FormData) {
        this.sentBody = body
        this.onload?.()
      }
    }
    vi.stubGlobal('XMLHttpRequest', MockXMLHttpRequest)
    const file = new File(['%PDF'], 'policy.pdf', { type: 'application/pdf' })

    const uploaded = await uploadDocument(file, vi.fn())

    expect(uploaded.status).toBe('processed')
    expect(xhrInstance?.openedWith).toEqual(['POST', '/api/documents'])
    expect(xhrInstance?.sentBody).toBeInstanceOf(FormData)
    expect(xhrInstance?.sentBody?.get('file')).toBe(file)
    expect(xhrInstance?.headers).toHaveLength(0)
    expect(xhrInstance?.timeout).toBe(240_000)
  })

  it('aborts a chat request after the configured timeout', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    }))
    vi.stubGlobal('fetch', fetchMock)

    const pending = askQuestion('How long?')
    const rejectedWithTimeout = expect(pending).rejects.toMatchObject({ status: 408 })
    await vi.advanceTimersByTimeAsync(120_000)
    await rejectedWithTimeout
  })
})
