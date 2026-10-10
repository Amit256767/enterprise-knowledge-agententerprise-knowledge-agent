import type { ReactNode } from 'react'

interface Block {
  type: 'paragraph' | 'heading' | 'unordered' | 'ordered'
  lines: string[]
  level?: number
}

function buildBlocks(text: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: Block | null = null

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', lines: paragraph })
    paragraph = []
  }
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/)
    const item = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.+)$/)
    if (!line.trim()) {
      flushParagraph()
      if (list) blocks.push(list)
      list = null
    } else if (heading) {
      flushParagraph()
      if (list) blocks.push(list)
      list = null
      blocks.push({ type: 'heading', lines: [heading[2]], level: heading[1].length })
    } else if (item) {
      flushParagraph()
      const type = item[2] ? 'ordered' : 'unordered'
      if (list && list.type !== type) {
        blocks.push(list)
        list = null
      }
      if (list === null) list = { type, lines: [] }
      list.lines.push(item[3])
    } else {
      if (list) blocks.push(list)
      list = null
      paragraph.push(line.trim())
    }
  }
  flushParagraph()
  if (list) blocks.push(list)
  return blocks
}

function InlineText({ text, citationPrefix, citationCount }: { text: string; citationPrefix: string; citationCount: number }) {
  const parts = text.split(/(\[\d+\])/g)
  return <>{parts.map((part, index) => {
    const marker = part.match(/^\[(\d+)\]$/)
    if (!marker) return <span key={index}>{part}</span>
    const citationIndex = Number(marker[1]) - 1
    return citationIndex >= 0 && citationIndex < citationCount
      ? <a className="inline-citation" href={`#${citationPrefix}-${citationIndex}`} key={index} aria-label={`Jump to source ${citationIndex + 1}`}>{part}</a>
      : <span key={index}>{part}</span>
  })}</>
}

export function FormattedAnswer({ text, citationPrefix, citationCount }: { text: string; citationPrefix: string; citationCount: number }) {
  const blocks = buildBlocks(text)
  return (
    <div className="formatted-answer">
      {blocks.map((block, index) => {
        const content = block.lines.map((line, lineIndex) => <InlineText text={line} citationPrefix={citationPrefix} citationCount={citationCount} key={lineIndex} />)
        if (block.type === 'heading') {
          const Heading = (block.level === 1 ? 'h2' : 'h3') as 'h2' | 'h3'
          return <Heading key={index}>{content}</Heading>
        }
        if (block.type === 'unordered' || block.type === 'ordered') {
          const List = (block.type === 'ordered' ? 'ol' : 'ul') as 'ol' | 'ul'
          return <List key={index}>{content.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</List>
        }
        return <p key={index}>{content.reduce<ReactNode[]>((joined, part, partIndex) => partIndex ? [...joined, ' ', part] : [part], [])}</p>
      })}
    </div>
  )
}
