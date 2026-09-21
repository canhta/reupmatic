import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordRendererDiagnostic } from './diagnostics';

interface Props {
  children: ReactNode;
  /** Rendered in place of the subtree that failed. */
  fallback: ReactNode;
}

/**
 * The one place a React render failure leaves evidence (D-61). Without it the tree unmounts and
 * the window goes blank with nothing written anywhere.
 *
 * `componentStack` is a list of component names, not source text, so it is diagnosable detail
 * rather than user content; the sink redacts it like any other field regardless.
 */
export class DiagnosticBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    recordRendererDiagnostic('error', 'renderer.render-failed', `${error.name}: ${error.message}`, {
      components: (info.componentStack ?? '').trim().split('\n').slice(0, 8).join(' > '),
    });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
