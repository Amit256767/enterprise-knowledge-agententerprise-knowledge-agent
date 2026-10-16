import type { ChatResponse, DocumentRecord } from './types'

// In production, VITE_API_URL points directly at the FastAPI origin. Locally,
// keep using the Vite /api proxy, which strips that prefix before forwarding.
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim().replace(/\/$/, '')
const API_ROOT = configuredApiUrl || '/api'
const API_REQUEST_TIMEOUT_MS = 120_000
const UPLOAD_TIMEOUT_MS = 240_000

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS)
  try {
    response = await fetch(`${API_ROOT}${path}`, { ...init, signal: controller.signal })
  } catch {
    if (controller.signal.aborted) {
      throw new ApiError('The request timed out. Please try again.', 408)
    }
    throw new ApiError('Could not connect to the knowledge agent. Check that the API is running.', 0)
  } finally {
    window.clearTimeout(timeout)
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const detail = body?.detail
    const message = typeof detail === 'string' ? detail : detail?.message
    throw new ApiError(message || `Request failed (${response.status})`, response.status)
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

export function listDocuments(): Promise<DocumentRecord[]> {
  return request<DocumentRecord[]>('/documents')
}

export function getDocument(id: string): Promise<DocumentRecord> {
  return request<DocumentRecord>(`/documents/${encodeURIComponent(id)}`)
}

export function deleteDocument(id: string): Promise<void> {
  return request<void>(`/documents/${id}`, { method: 'DELETE' })
}

export function askQuestion(question: string): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  })
}

export function uploadDocument(
  file: File,
  onProgress: (percentage: number) => void,
): Promise<DocumentRecord> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_ROOT}/documents`)
    xhr.timeout = UPLOAD_TIMEOUT_MS
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => reject(new ApiError('Upload failed. Check that the API is running.', 0))
    xhr.ontimeout = () => reject(new ApiError('Document processing timed out. Please try again.', 408))
    xhr.onload = () => {
      let body: { detail?: string | { message?: string } } & Partial<DocumentRecord>
      try {
        body = JSON.parse(xhr.responseText || '{}')
      } catch {
        reject(new ApiError('The server returned an unreadable response.', xhr.status))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as DocumentRecord)
      } else {
        const detail = body?.detail
        const message = typeof detail === 'string' ? detail : detail?.message
        reject(new ApiError(message || `Upload failed (${xhr.status})`, xhr.status))
      }
    }
    const form = new FormData()
    form.append('file', file)
    xhr.send(form)
  })
}
