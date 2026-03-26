import { describe, it, expect, afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { normalizeHTML, renderWithOrg } from '../test-helpers'
import UploadPrompt from './UploadPrompt'

describe('UploadPrompt golden', () => {
  afterEach(() => cleanup())

  it('default render', () => {
    const { container } = renderWithOrg(<UploadPrompt />)
    expect(normalizeHTML(container.innerHTML)).toMatchFileSnapshot('./__golden__/upload-prompt-default.golden')
  })
})
