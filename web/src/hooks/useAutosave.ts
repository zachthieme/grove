import { useEffect, useRef, useState } from 'react'
import type { AutosaveData } from '../api/types'
import { AUTOSAVE_STORAGE_KEY } from '../constants'
import { useOrgData } from '../store/OrgContext'
import * as api from '../api/client'

const AUTOSAVE_DEBOUNCE_MS = 2000

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      if (attempt === maxAttempts - 1) throw err
      await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt)))
    }
  }
  throw new Error('unreachable')
}

export function useAutosave(suppressAutosaveRef?: React.RefObject<boolean>) {
  const { original, working, recycled, pods, originalPods, settings, currentSnapshotName, loaded } = useOrgData()
  const timerRef = useRef<number>(undefined)
  const [serverSaveError, setServerSaveError] = useState(false)

  useEffect(() => {
    if (!loaded || working.length === 0 || suppressAutosaveRef?.current) return

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      const data: AutosaveData = {
        original,
        working,
        recycled,
        pods,
        originalPods,
        settings,
        snapshotName: currentSnapshotName ?? '',
        timestamp: new Date().toISOString(),
      }
      try {
        localStorage.setItem(AUTOSAVE_STORAGE_KEY, JSON.stringify(data))
      } catch (e) {
        console.warn('localStorage autosave failed:', e)
      }
      retryWithBackoff(() => api.writeAutosave(data))
        .then(() => setServerSaveError(false))
        .catch((err) => {
          console.warn('Server autosave failed after retries:', err)
          setServerSaveError(true)
        })
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [original, working, recycled, pods, originalPods, settings, currentSnapshotName, loaded])

  return { serverSaveError }
}
