import { Component, StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

type ErrorBoundaryState = {
  hasError: boolean
  message: string
}

function probe(message: string): void {
  try {
    window.desktopAPI?.ackMenuCommand(message)
  } catch {
    // ignore probe failures
  }
}

class RootErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  componentDidCatch(error: Error): void {
    this.setState({
      hasError: true,
      message: error?.message || 'Unknown error',
    })
    probe(`__app-crash__:${error?.message || 'unknown'}`)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16, fontFamily: 'sans-serif' }}>
          <h2>应用初始化失败</h2>
          <p>{this.state.message || '请查看日志定位问题。'}</p>
        </div>
      )
    }
    return this.props.children
  }
}

probe('__renderer-entry__')
window.addEventListener('error', (event) => {
  probe(`__renderer-error__:${event.message || 'unknown'}`)
})
window.addEventListener('unhandledrejection', (event) => {
  const reason = typeof event.reason === 'string' ? event.reason : event.reason?.message
  probe(`__renderer-rejection__:${reason || 'unknown'}`)
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
