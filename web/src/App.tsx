import { Component, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { LayersDebugPanel } from './components/debug/LayersDebugPanel'
import { TelemetryProvider } from './hooks/useTelemetryWorker'
import { c2 } from './theme/c2CssVars'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
})

interface ErrorBoundaryState {
  error: Error | null
}

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: 32,
          fontFamily: "'JetBrains Mono', monospace",
          color: c2('alertCritical'),
          background: c2('bgPrimary'),
          height: '100vh',
          overflow: 'auto',
        }}>
          <h2 style={{ color: c2('textPrimary'), margin: '0 0 16px' }}>RENDER ERROR</h2>
          <pre style={{ fontSize: 13, whiteSpace: 'pre-wrap', color: c2('textSecondary') }}>
            {this.state.error.message}
          </pre>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', color: c2('textMuted'), marginTop: 16 }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: 16,
              padding: '8px 16px',
              background: c2('surfaceSecondary'),
              color: c2('textPrimary'),
              border: `1px solid ${c2('border')}`,
              cursor: 'pointer',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            RETRY
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TelemetryProvider>
          <AppLayout />
          <LayersDebugPanel />
        </TelemetryProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}
