import type { Citation } from '../types'

export function CitationCard({ citation, index, id, variant = 'conversation' }: {
  citation: Citation
  index: number
  id: string
  variant?: 'conversation' | 'source-panel'
}) {
  return (
    <details className={`citation-card citation-${variant}`} id={id}>
      <summary>
        <span className="citation-number">{index + 1}</span>
        <span className="citation-source">
          <strong title={citation.document_name}>{citation.document_name}</strong>
          <small>Page {citation.page_number}</small>
        </span>
        <span className="citation-toggle">View passage</span>
      </summary>
      <blockquote>{citation.passage}</blockquote>
    </details>
  )
}
