import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Root crash boundary. When a render throws and nothing catches it, React
 * unmounts the whole tree and leaves a blank page; this catches those errors and
 * shows a calm recovery screen instead.
 *
 * It is the OUTER net: the router's own `errorElement` (see app/router.tsx)
 * handles per-route render/loader errors, and this catches anything above or
 * outside the routed tree — the query/theme providers and the router itself.
 *
 * Deliberately hand-rolled with plain elements and the already-loaded global
 * stylesheet: no component or context dependency that could itself be the thing
 * that just failed (an error boundary cannot catch a throw in its own fallback).
 * The theme still applies because it lives on `<html data-theme>`, set before
 * first paint, independent of any React provider.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // `console.error` is the logging channel eslint allows in browser code, and
    // is enough to surface the stack in dev and feed any wired-up prod reporter.
    console.error('Unhandled application error:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="mc-onboarding" role="alert">
        <section className="mc-card mc-card--elevated">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mc-space-4)' }}>
            <p className="mc-eyebrow">Something went wrong</p>
            <h1 className="mc-h2">The app hit an unexpected error.</h1>
            <p className="mc-muted">
              This one is on us. Try again, or head back to the start — your saved progress is safe.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--mc-space-3)' }}>
              <button
                type="button"
                className="mc-button mc-button--primary mc-button--lg"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
              <a className="mc-button mc-button--secondary mc-button--lg mc-linkbtn" href="/">
                Go home
              </a>
            </div>
          </div>
        </section>
      </div>
    );
  }
}
