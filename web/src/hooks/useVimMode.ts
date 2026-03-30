import { useState, useCallback } from 'react'

export function useVimMode() {
  const [vimMode, setVimMode] = useState(() => localStorage.getItem('grove-vim-mode') === '1')

  const toggleVimMode = useCallback((on: boolean) => {
    setVimMode(on)
    localStorage.setItem('grove-vim-mode', on ? '1' : '0')
  }, [])

  return { vimMode, toggleVimMode }
}
