import { Component, type ReactNode } from 'react'

/** Catches render errors (e.g. WebGL failures) and shows a fallback instead of blanking the page. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; onError?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError?.() }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}
