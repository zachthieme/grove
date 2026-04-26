import { useEffect } from 'react'
import styles from './VimCheatSheet.module.css'

interface VimCheatSheetProps {
  onClose: () => void
}

interface Binding {
  keys: string
  desc: string
}

interface Section {
  title: string
  bindings: Binding[]
}

// Source of truth: the docstring on useVimNav.ts. Keep in sync when
// bindings change — VimCheatSheet.test.tsx asserts this list matches
// what the hook documents.
const SECTIONS: Section[] = [
  {
    title: 'Navigate',
    bindings: [
      { keys: 'h / ←', desc: 'Move left' },
      { keys: 'l / →', desc: 'Move right' },
      { keys: 'j / ↓', desc: 'Move down' },
      { keys: 'k / ↑', desc: 'Move up' },
      { keys: 'gg', desc: 'Jump to root manager' },
      { keys: 'G', desc: 'Jump to deepest leaf in current subtree' },
      { keys: 'gp', desc: 'Jump to parent of selection' },
    ],
  },
  {
    title: 'Add',
    bindings: [
      { keys: 'o', desc: 'Add report under selection (or sibling product if selection is a product)' },
      { keys: 'O', desc: 'Add parent above selection' },
      { keys: 'a', desc: 'Append sibling at the current level (same parent / team / pod)' },
      { keys: 'P', desc: 'Add product (sibling on a product, child on a person, in-pod on a pod)' },
    ],
  },
  {
    title: 'Mutate',
    bindings: [
      { keys: 'd', desc: 'Delete selection (sends to recycle bin)' },
      { keys: 'x', desc: 'Cut selection (mark for move)' },
      { keys: 'p', desc: 'Paste cut nodes under selection' },
    ],
  },
  {
    title: 'Selection',
    bindings: [
      { keys: '/', desc: 'Focus search' },
      { keys: '⌘A / Ctrl+A', desc: 'Select all people' },
      { keys: 'Esc', desc: 'Cancel cut / clear selection / clear focused person' },
    ],
  },
  {
    title: 'Help',
    bindings: [
      { keys: '?', desc: 'Open this cheat sheet' },
    ],
  },
]

export default function VimCheatSheet({ onClose }: VimCheatSheetProps) {
  // Esc closes. Other key handlers are off so the cheat sheet doesn't
  // intercept normal page input when accidentally left mounted.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', handler, { capture: true })
    return () => window.removeEventListener('keydown', handler, { capture: true })
  }, [onClose])

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="vim-cheatsheet-title">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 id="vim-cheatsheet-title" className={styles.title}>Keyboard shortcuts</h3>
        <p className={styles.subtitle}>Active when Vim navigation is enabled in Settings.</p>
        <div className={styles.list}>
          {SECTIONS.map((section) => (
            <div key={section.title} style={{ display: 'contents' }}>
              <div className={styles.section}>{section.title}</div>
              {section.bindings.map((b) => (
                <div key={b.keys} style={{ display: 'contents' }}>
                  <span className={styles.key}>{b.keys}</span>
                  <span className={styles.desc}>{b.desc}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className={styles.actions}>
          <button className={styles.closeBtn} onClick={onClose} autoFocus>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
