import { useState, type DragEvent } from 'react'
import { Icon } from './Icon'

interface UploadDropzoneProps {
  onBrowse: () => void
  onFile: (file?: File) => void
  progress: number | null
  compact?: boolean
}

export function UploadDropzone({ onBrowse, onFile, progress, compact = false }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false)

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragging(false)
    onFile(event.dataTransfer.files[0])
  }

  return (
    <div
      className={`upload-dropzone${dragging ? ' is-dragging' : ''}${compact ? ' upload-dropzone-compact' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={handleDrop}
      aria-label="PDF upload area"
    >
      <span className="dropzone-icon"><Icon name="upload" size={20} /></span>
      <div className="dropzone-copy">
        <strong>{progress !== null ? 'Uploading and indexing your PDF' : 'Add knowledge to your workspace'}</strong>
        <span>{progress !== null ? 'Keep this window open while your file is transferred.' : 'Drag a PDF here, or choose a file from your device.'}</span>
      </div>
      {progress !== null ? (
        <div className="dropzone-progress" role="status" aria-live="polite">
          <strong>{progress}%</strong>
          <span className="progress-track"><span className="progress-value" style={{ width: `${progress}%` }} /></span>
        </div>
      ) : (
        <button className="button button-secondary dropzone-button" type="button" onClick={onBrowse}>
          <Icon name="plus" size={16} /> Choose PDF
        </button>
      )}
      {!compact && <span className="dropzone-footnote">PDF files only <span aria-hidden="true">·</span> Upload limit is checked before transfer</span>}
    </div>
  )
}
