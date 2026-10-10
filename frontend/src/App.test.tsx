import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const api = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  askQuestion: vi.fn(),
  uploadDocument: vi.fn(),
  deleteDocument: vi.fn(),
}))

vi.mock('./api', () => ({
  ApiError: class ApiError extends Error { status = 0 },
  ...api,
}))

describe('knowledge agent interface', () => {
  beforeEach(() => {
    api.listDocuments.mockResolvedValue([])
    api.askQuestion.mockReset()
    api.uploadDocument.mockReset()
    api.deleteDocument.mockReset()
  })

  it('shows the empty library and suggested questions', async () => {
    render(<App />)

    expect(await screen.findByText('No documents yet')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ask your documents' })).toBeInTheDocument()
    expect(screen.getAllByText('What are the data retention requirements?').length).toBeGreaterThan(0)
  })

  it('renders a grounded answer with document and page citation', async () => {
    api.askQuestion.mockResolvedValue({
      answer: 'Financial records are retained for seven years.',
      abstained: false,
      conflicting_evidence: false,
      citations: [{
        chunk_id: 'chunk-1',
        document_id: 'doc-1',
        document_name: 'retention-policy.pdf',
        page_number: 4,
        passage: 'Financial records must be retained for seven years.',
      }],
    })
    render(<App />)
    await screen.findByText('No documents yet')

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask a question about your documents' }), {
      target: { value: 'How long are financial records retained?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText('Financial records are retained for seven years.')).toBeInTheDocument()
    expect(screen.getAllByText('retention-policy.pdf').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Page 4').length).toBeGreaterThan(0)
    fireEvent.click(screen.getAllByText('View passage')[0])
    expect(screen.getAllByText('Financial records must be retained for seven years.').length).toBeGreaterThan(0)
  })

  it('clearly displays an evidence abstention', async () => {
    api.askQuestion.mockResolvedValue({
      answer: "I couldn't find relevant evidence in the uploaded documents to answer that question.",
      abstained: true,
      conflicting_evidence: false,
      citations: [],
    })
    render(<App />)
    await screen.findByText('No documents yet')

    fireEvent.change(screen.getByRole('textbox', { name: 'Ask a question about your documents' }), {
      target: { value: 'What color is the office?' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }))

    expect(await screen.findByText('Insufficient evidence')).toBeInTheDocument()
  })

  it('rejects non-PDF uploads before calling the API', async () => {
    render(<App />)
    await screen.findByText('No documents yet')
    const input = screen.getByRole('textbox', { name: 'Ask a question about your documents' })
    expect(input).toBeInTheDocument()
    const fileInput = screen.getByLabelText('Choose a PDF document') as HTMLInputElement
    const textFile = new File(['not a pdf'], 'notes.txt', { type: 'text/plain' })
    fireEvent.change(fileInput, { target: { files: [textFile] } })

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Choose a PDF file'))
    expect(api.uploadDocument).not.toHaveBeenCalled()
  })

  it('shows file transfer progress while a PDF is uploading', async () => {
    let completeUpload!: () => void
    api.uploadDocument.mockImplementation((_file, onProgress) => new Promise((resolve) => {
      onProgress(45)
      completeUpload = () => resolve({
        id: 'doc-1', filename: 'policy.pdf', size_bytes: 1024,
        status: 'processed', page_count: 1, error_message: null,
      })
    }))
    render(<App />)
    await screen.findByText('No documents yet')
    const pdf = new File(['%PDF-'], 'policy.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Choose a PDF document'), { target: { files: [pdf] } })

    expect(await screen.findByText('45%')).toBeInTheDocument()
    completeUpload()
    await waitFor(() => expect(screen.queryByText('45%')).not.toBeInTheDocument())
  })
})
