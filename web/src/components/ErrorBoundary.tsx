import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children: ReactNode
  /** Contextual label shown in the fallback UI (e.g. "chart view", "sidebar"). */
  label?: string
  /** Use compact inline styling instead of the full-page fallback. */
  inline?: boolean
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      const label = this.props.label ?? 'this section'
      if (this.props.inline) {
        return (
          <div style={{
            padding: '16px 20px',
            color: 'var(--text-secondary)',
            fontSize: 13,
            border: '1px solid var(--border-soft)',
            borderRadius: 6,
            background: 'var(--surface-raised)',
            margin: 8,
          }}>
            <strong style={{ color: 'var(--grove-red)' }}>Error rendering {label}</strong>
            <p style={{ margin: '6px 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {this.state.error.message}
            </p>
            <button
              onClick={() => this.setState({ error: null })}
              style={{
                padding: '4px 12px',
                fontSize: 12,
                fontWeight: 600,
                borderRadius: 4,
                border: '1px solid var(--grove-green)',
                background: 'var(--grove-green)',
                color: '#fff',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )
      }
      return (
        <div style={{
          padding: 40,
          textAlign: 'center',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body)',
        }}>
          <h2 style={{ color: 'var(--grove-red)', marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{this.state.error.message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              padding: '8px 20px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: '1px solid var(--grove-green)',
              background: 'var(--grove-green)',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
