import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

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
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-2xl w-full">
            <div className="card text-center">
              <ExclamationTriangleIcon className="mx-auto h-16 w-16 text-red-500 mb-6" />

              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-4">
                Oops! Something went wrong
              </h1>

              <p className="text-gray-600 dark:text-gray-400 mb-6">
                We're sorry for the inconvenience. An unexpected error has occurred.
              </p>

              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="mb-6 text-left">
                  <details className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <summary className="font-semibold text-red-800 dark:text-red-200 cursor-pointer mb-2">
                      Error Details (Development Only)
                    </summary>
                    <div className="text-sm">
                      <p className="font-mono text-red-700 dark:text-red-300 mb-2">
                        {this.state.error.toString()}
                      </p>
                      {this.state.errorInfo && (
                        <pre className="text-xs overflow-auto text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 p-3 rounded">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      )}
                    </div>
                  </details>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <button onClick={this.handleReload} className="btn btn-primary">
                  Reload Page
                </button>
                <button onClick={this.handleGoHome} className="btn btn-secondary">
                  Go to Homepage
                </button>
              </div>

              <p className="mt-6 text-sm text-gray-500 dark:text-gray-500">
                If this problem persists, please contact support.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
