import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { normalizeHTML } from '../test-helpers'
import UploadPrompt from './UploadPrompt'

vi.mock('../store/OrgContext', () => ({
  useOrg: () => ({
    upload: vi.fn(),
  }),
}))

describe('UploadPrompt golden', () => {
  afterEach(() => cleanup())

  it('default render', () => {
    const { container } = render(<UploadPrompt />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/upload-prompt-default.golden')
  })
})
