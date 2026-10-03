import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  label: string
}

type State = {
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`${this.props.label} failed to render`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <section className="page page-stack" role="alert">
          <h1 className="page-title">{this.props.label}</h1>
          <p>This page could not be displayed because the snapshot data was not in the expected format.</p>
        </section>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
