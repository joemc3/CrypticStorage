import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { Button } from './common/Button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center bg-bg px-4">
          <div className="w-full max-w-xl">
            <div className="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface p-6 text-center">
              <ExclamationTriangleIcon className="h-10 w-10 text-warn-text" aria-hidden="true" />

              <h1 className="text-2xl font-semibold text-ink">Something went wrong</h1>

              <p className="text-ink-2">An unexpected error stopped this page. Reloading usually clears it.</p>

              {import.meta.env.DEV && this.state.error && (
                <details className="w-full rounded-lg border border-line bg-danger-soft p-4 text-left">
                  <summary className="cursor-pointer font-semibold text-danger-text">Error details (development only)</summary>
                  <div className="mt-2 text-sm">
                    <p className="mb-2 font-mono text-danger-text">{this.state.error.toString()}</p>
                    {this.state.errorInfo && (
                      <pre className="overflow-auto rounded bg-surface p-3 text-xs text-ink-2">{this.state.errorInfo.componentStack}</pre>
                    )}
                  </div>
                </details>
              )}

              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Button onClick={this.handleReload}>Reload page</Button>
                <Button variant="secondary" onClick={this.handleGoHome}>
                  Go to the homepage
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
