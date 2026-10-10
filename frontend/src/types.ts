export type DocumentStatus = 'processing' | 'processed' | 'failed'

export interface DocumentRecord {
  id: string
  filename: string
  size_bytes: number
  status: DocumentStatus
  page_count: number
  error_message: string | null
}

export interface Citation {
  chunk_id: string
  document_id: string
  document_name: string
  page_number: number
  passage: string
}

export interface ChatResponse {
  answer: string
  abstained: boolean
  conflicting_evidence: boolean
  citations: Citation[]
  retrieved_sources?: Array<{
    chunk_id: string
    document_id: string
    document_name: string
    page_number: number
    score: number
  }>
  metrics?: {
    latency_ms: number
    additional_searches: number
    search_tools: string[]
    llm_calls: number
    prompt_tokens: number | null
    completion_tokens: number | null
    estimated_llm_cost_usd: number | null
  } | null
}
