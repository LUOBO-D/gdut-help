import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from './Button';
import { GlassCard } from './GlassCard';

interface Props {
  fallback?: ReactNode;
  onError?: (error: unknown) => void;
  children: ReactNode;
}

/** 捕获子树渲染错误，显示 fallback。用于 3D 与页面级容错，出错时不影响导航和其余部分。 */
export class ErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error);
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children;
  }
}

export function PageErrorFallback() {
  return (
    <GlassCard className="mx-auto mt-10 max-w-md p-6 text-center">
      <h2 className="text-lg font-semibold">页面遇到了一点小问题</h2>
      <p className="mt-1.5 text-sm text-fg-muted">刚才的渲染没有顺利完成，重新加载通常可以恢复。</p>
      <Button className="mt-5 h-10 px-5 text-sm" onClick={() => window.location.reload()}>
        重新加载
      </Button>
    </GlassCard>
  );
}
