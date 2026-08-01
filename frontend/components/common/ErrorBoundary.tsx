'use client';

import React, { Component, ReactNode } from 'react';
import { Button } from './Button';
import { logger } from '@/lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('Error Boundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-bg px-4">
          <div className="max-w-md w-full bg-surface rounded-lg shadow-md p-8 text-center">
            <div className="w-16 h-16 bg-[color:var(--danger-soft)] rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-[color:var(--danger)]"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-fg mb-2">Something went wrong</h2>
            <p className="text-fg-2 mb-6">
              We&apos;re sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-fg-3 hover:text-fg-2 dark:hover:text-gray-300">
                  Error details
                </summary>
                <pre className="mt-2 p-4 bg-bg rounded text-xs overflow-auto text-fg dark:text-fg-2">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <Button onClick={() => window.location.reload()} variant="primary">
                Refresh Page
              </Button>
              <Button onClick={() => (window.location.href = '/workspaces')} variant="outline">
                Go to Workspaces
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
