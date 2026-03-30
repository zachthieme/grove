import { useState, useEffect, useCallback } from 'react'
import { getConfig, setLoggingEnabled as setClientLogging } from '../api/client'

export function useLogging() {
  const [loggingEnabled, setLoggingEnabled] = useState(false)
  const [logPanelOpen, setLogPanelOpen] = useState(false)

  useEffect(() => {
    getConfig().then((cfg) => {
      setLoggingEnabled(cfg.logging)
      setClientLogging(cfg.logging)
    }).catch(() => {})
  }, [])

  const toggleLogs = useCallback(() => setLogPanelOpen((o) => !o), [])

  return { loggingEnabled, logPanelOpen, toggleLogs, setLogPanelOpen }
}
