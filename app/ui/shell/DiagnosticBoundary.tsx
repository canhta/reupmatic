import { Component, type ErrorInfo, type ReactNode } from 'react';
import { recordRendererDiagnostic } from './diagnostics';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

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
