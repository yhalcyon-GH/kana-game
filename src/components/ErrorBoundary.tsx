import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null; info: ErrorInfo | null }

// The app has never had one of these — a render error anywhere just
// unmounts the whole tree to a blank white page with nothing logged
// anywhere reachable without the device's own devtools. This is a
// diagnostic tool: it makes a crash visible ON THE SCREEN so a report like
// "Review shows a blank page on my phone" comes with an actual error
// message next time, instead of requiring USB/remote debugging just to see
// what's throwing. Temporary, for tracking down that specific bug — once
// it's found, this can go or turn into a nicer permanent fallback UI.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error) {
    return { error, info: null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ error, info })
  }

  render() {
    const { error, info } = this.state
    if (!error) return this.props.children
    return (
      <div style={{ padding: 16, fontFamily: 'monospace', fontSize: 13, whiteSpace: 'pre-wrap', color: '#111', background: '#fff' }}>
        <h1 style={{ fontSize: 16, fontWeight: 'bold', color: '#c00' }}>App crashed</h1>
        <p>
          <strong>{error.name}:</strong> {error.message}
        </p>
        <p style={{ marginTop: 12 }}>{error.stack}</p>
        {info?.componentStack && (
          <>
            <h2 style={{ fontSize: 14, fontWeight: 'bold', marginTop: 16 }}>Component stack</h2>
            <p>{info.componentStack}</p>
          </>
        )}
      </div>
    )
  }
}
