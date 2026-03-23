import { describe, it, expect } from 'vitest'
import { sanitizeFilename, deduplicateFilenames } from './snapshotExportUtils'

describe('sanitizeFilename', () => {
  it('replaces unsafe characters with dashes', () => {
    expect(sanitizeFilename('Q1/Plan')).toBe('Q1-Plan')
    expect(sanitizeFilename('foo\\bar:baz')).toBe('foo-bar-baz')
    expect(sanitizeFilename('a*b?c"d<e>f|g')).toBe('a-b-c-d-e-f-g')
  })

  it('collapses consecutive dashes', () => {
    expect(sanitizeFilename('a//b')).toBe('a-b')
  })

  it('trims leading and trailing dashes', () => {
    expect(sanitizeFilename('/hello/')).toBe('hello')
  })

  it('passes through clean names', () => {
    expect(sanitizeFilename('Q1-Plan')).toBe('Q1-Plan')
    expect(sanitizeFilename('Reorg v2')).toBe('Reorg v2')
  })
})

describe('deduplicateFilenames', () => {
  it('returns names unchanged when no duplicates', () => {
    expect(deduplicateFilenames(['a', 'b', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('appends suffix for duplicates', () => {
    expect(deduplicateFilenames(['a', 'a', 'a'])).toEqual(['a', 'a-2', 'a-3'])
  })

  it('handles mixed duplicates', () => {
    expect(deduplicateFilenames(['x', 'y', 'x'])).toEqual(['x', 'y', 'x-2'])
  })
})
