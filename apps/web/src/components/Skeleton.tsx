import { GlassCard } from './GlassCard';

/** 柔和玻璃骨架屏，替代生硬的「加载中…」文字 */
export function SkeletonBlock({ className = 'h-20 w-full' }: { className?: string }) {
  return <div className={`surface-subtle animate-pulse rounded-2xl ${className}`} aria-hidden="true" />;
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <GlassCard className="space-y-3 p-5" aria-busy="true" aria-label="加载中">
      <SkeletonBlock className="h-5 w-1/3" />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBlock key={i} className="h-12 w-full" />
      ))}
    </GlassCard>
  );
}
