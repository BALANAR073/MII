import { cx } from '../../lib/cx';

interface SkeletonProps {
  className?: string;
}

/** Серый прямоугольник-заглушка на время загрузки (NFR-9). */
export function Skeleton({ className = 'h-4 w-full' }: SkeletonProps) {
  return <span aria-hidden="true" className={cx('block animate-pulse rounded-xl bg-slate-200', className)} />;
}

interface SkeletonListProps {
  rows?: number;
  label?: string;
}

/** Набор строк-заглушек с подписью для скринридера. */
export function SkeletonList({ rows = 4, label = 'Загрузка…' }: SkeletonListProps) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-3 rounded-xl bg-white p-4">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}
