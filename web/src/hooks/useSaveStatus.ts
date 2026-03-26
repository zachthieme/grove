import { useState, useEffect, useRef, useCallback } from 'react'

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useSaveStatus() {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const timerRef = useRef<number>(undefined)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const markSaving = useCallback(() => {
    setSaveStatus('saving')
    setSaveError(null)
  }, [])

  const markSaved = useCallback(() => {
    setSaveStatus('saved')
    setSaveError(null)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setSaveStatus((s) => s === 'saved' ? 'idle' : s), 1500)
  }, [])

  const markError = useCallback((msg: string) => {
    setSaveStatus('error')
    setSaveError(msg)
  }, [])

  const reset = useCallback(() => {
    setSaveStatus('idle')
    setSaveError(null)
  }, [])

  return { saveStatus, saveError, markSaving, markSaved, markError, reset }
}
