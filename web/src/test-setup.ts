import { expect, vi } from 'vitest'
import * as matchers from 'vitest-axe/matchers'

expect.extend(matchers)

// Mock @tanstack/react-virtual so useVirtualizer works in jsdom (no real scroll dimensions).
// Returns all items as visible — no virtualization in tests.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => {
    const size = opts.estimateSize()
    const items = Array.from({ length: opts.count }, (_, i) => ({
      index: i,
      start: i * size,
      end: (i + 1) * size,
      size,
      key: i,
    }))
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * size,
      scrollToIndex: () => {},
      measureElement: () => {},
    }
  },
}))

// Type augmentation for vitest-axe custom matchers
declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface Assertion {
    toHaveNoViolations(): void
  }
}
