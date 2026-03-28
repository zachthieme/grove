// Scenarios: EXPORT-007
import { describe, it, expect } from 'vitest'
import { sanitizeFilename, deduplicateFilenames } from './snapshotExportUtils'

describe('sanitizeFilename', () => {
  it('[EXPORT-006] replaces unsafe characters with dashes', () => {
    expect(sanitizeFilename('Q1/Plan')).toBe('Q1-Plan')
    expect(sanitizeFilename('foo\\bar:baz')).toBe('foo-bar-baz')
    expect(sanitizeFilename('a*b?c"d<e>f|g')).toBe('a-b-c-d-e-f-g')
  })

  it('[EXPORT-006] collapses consecutive dashes', () => {
    expect(sanitizeFilename('a//b')).toBe('a-b')
  })

  it('[EXPORT-006] trims leading and trailing dashes', () => {
    expect(sanitizeFilename('/hello/')).toBe('hello')
  })

  it('[EXPORT-006] passes through clean names', () => {
    expect(sanitizeFilename('Q1-Plan')).toBe('Q1-Plan')
    expect(sanitizeFilename('Reorg v2')).toBe('Reorg v2')
  })
})

describe('deduplicateFilenames', () => {
  it('[EXPORT-006] returns names unchanged when no duplicates', () => {
    expect(deduplicateFilenames(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('[EXPORT-006] appends suffix for duplicates', () => {
    expect(deduplicateFilenames(['a', 'a', 'a'])).toEqual(['a', 'a-2', 'a-3'])
  })

  it('[EXPORT-006] handles mixed duplicates', () => {
    expect(deduplicateFilenames(['x', 'y', 'x'])).toEqual(['x', 'y', 'x-2'])
  })
})
