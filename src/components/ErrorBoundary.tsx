import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep technical diagnostics available to developers without exposing
    // implementation details in the learner-facing fallback UI.
    console.error('KanaGame render error', error, info)
  }

  private retry = () => {
    this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center dark:border-neutral-700 dark:bg-neutral-800">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Try again, or return to Home.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={this.retry}
            className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Try Again
          </button>
          <a
            href={`${import.meta.env.BASE_URL}#/`}
            className="rounded-full border border-neutral-300 px-5 py-2 text-sm font-semibold text-neutral-700 hover:border-blue-400 dark:border-neutral-600 dark:text-neutral-200"
          >
            Go Home
          </a>
        </div>
      </div>
    )
  }
}
