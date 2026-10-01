import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center p-6" role="alert">
          <div className="panel max-w-md p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-red-400/25 bg-red-400/10">
              <AlertCircle className="h-6 w-6 text-red-400" aria-hidden="true" />
            </div>
            <h1 className="mb-2 font-display text-2xl font-semibold text-stone-100">Something went wrong</h1>
            <p className="mx-auto mb-6 max-w-sm text-sm text-stone-400">
              We encountered an unexpected error. Please try refreshing the page or go back to Today.
            </p>
            <Button onClick={this.reset}>
              Go to Today
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}