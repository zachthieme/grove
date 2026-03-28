import { useState, useEffect, useCallback } from 'react'
import { getLogs, clearLogs, type LogsResponse } from '../api/client'
import styles from './LogPanel.module.css'

interface LogPanelProps {
  onClose: () => void
}

export default function LogPanel({ onClose }: LogPanelProps) {
  const [data, setData] = useState<LogsResponse | null>(null)
  const [filter, setFilter] = useState<{ correlationId?: string; source?: string }>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const resp = await getLogs(filter)
      setData(resp)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs')
    }
  }, [filter])

  useEffect(() => { refresh() }, [refresh])

  const handleClear = async () => {
    try {
      await clearLogs()
      await refresh()
    } catch { /* ignore */ }
  }

  const handleDownload = async () => {
    try {
      const resp = await getLogs()
      const blob = new Blob([JSON.stringify(resp, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `grove-logs-${new Date().toISOString().slice(0, 19)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  const handleFilterCorrelation = (id: string) => {
    setFilter((f) => f.correlationId === id ? {} : { ...f, correlationId: id })
  }

  const statusColor = (status?: number) => {
    if (!status) return undefined
    if (status >= 400) return styles.statusError
    if (status >= 300) return styles.statusWarn
    return styles.statusOk
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h3>Request Logs</h3>
        <div className={styles.actions}>
          <select
            value={filter.source ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, source: e.target.value || undefined }))}
          >
            <option value="">All sources</option>
            <option value="api">API</option>
            <option value="web">Web</option>
          </select>
          {filter.correlationId && (
            <button className={styles.filterTag} onClick={() => setFilter((f) => ({ ...f, correlationId: undefined }))} aria-label={`Remove filter ${filter.correlationId}`}>
              {filter.correlationId} ×
            </button>
          )}
          <button onClick={refresh}>Refresh</button>
          <button onClick={handleClear}>Clear</button>
          <button onClick={handleDownload}>Download</button>
          <button onClick={onClose} aria-label="Close">×</button>
        </div>
      </div>
      {error && <div className={styles.error}>{error}</div>}
      <div className={styles.meta}>
        {data && <span>{data.count} entries (buffer: {data.bufferSize})</span>}
      </div>
      <div className={styles.entries}>
        {data?.entries.map((entry) => (
          <div key={entry.id} className={styles.entry}>
            <div className={styles.entryRow} onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedId(expandedId === entry.id ? null : entry.id) } }} role="button" tabIndex={0}>
              <span className={styles.timestamp}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
              <span className={`${styles.source} ${entry.source === 'api' ? styles.sourceApi : styles.sourceWeb}`}>
                {entry.source}
              </span>
              <span className={styles.method}>{entry.method}</span>
              <span className={styles.path}>{entry.path}</span>
              <span className={`${styles.status} ${statusColor(entry.responseStatus)}`}>
                {entry.responseStatus}
              </span>
              <span className={styles.duration}>{entry.durationMs}ms</span>
              {entry.correlationId && (
                <button
                  className={styles.corrId}
                  onClick={(e) => { e.stopPropagation(); handleFilterCorrelation(entry.correlationId!) }}
                >
                  {entry.correlationId.slice(0, 8)}
                </button>
              )}
            </div>
            {expandedId === entry.id && (
              <div className={styles.detail}>
                {entry.requestBody != null && (
                  <div>
                    <strong>Request:</strong>
                    <pre>{JSON.stringify(entry.requestBody, null, 2)}</pre>
                  </div>
                )}
                {entry.responseBody != null && (
                  <div>
                    <strong>Response:</strong>
                    <pre>{JSON.stringify(entry.responseBody, null, 2)}</pre>
                  </div>
                )}
                {entry.error && <div className={styles.error}>Error: {String(entry.error)}</div>}
              </div>
            )}
          </div>
        ))}
        {data?.entries.length === 0 && <div className={styles.empty}>No log entries</div>}
      </div>
    </div>
  )
}
