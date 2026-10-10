import type { ReactNode } from 'react'

export type IconName =
  | 'sparkle' | 'message' | 'files' | 'history' | 'settings' | 'upload'
  | 'plus' | 'arrow' | 'trash' | 'file' | 'shield' | 'check' | 'warning'
  | 'close' | 'send' | 'book' | 'search' | 'clock' | 'chevron' | 'external'

const paths: Record<IconName, ReactNode> = {
  sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9L19 16Z"/></>,
  message: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l1.4-3.2A7.5 7.5 0 1 1 20 11.5Z"/><path d="M8.5 11.5h7M8.5 8.5h4"/></>,
  files: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></>,
  history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 2Z" transform="translate(-1 -1) scale(1.08)"/></>,
  upload: <><path d="M12 16V4m-5 5 5-5 5 5"/><path d="M20 16.5v2A2.5 2.5 0 0 1 17.5 21h-11A2.5 2.5 0 0 1 4 18.5v-2"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
  trash: <><path d="M3 6h18M8 6V4h8v2m3 0-.8 14H5.8L5 6m4 4v6m6-6v6"/></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></>,
  shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/></>,
  close: <><path d="m18 6-12 12M6 6l12 12"/></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></>,
  book: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  chevron: <path d="m7 10 5 5 5-5"/>,
  external: <><path d="M14 3h7v7m0-7-9 9"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></>,
}

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}
