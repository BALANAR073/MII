import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { SkeletonList } from '../components/ui/Skeleton';
import { useAuth } from './AuthProvider';

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Защищённые маршруты (FR-1.2): без входа — переход на /login с адресом возврата в `next` (AC-T1.3).
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status === 'loading') {
    return <SkeletonList rows={3} label="Проверяем вход…" />;
  }
  if (state.user === null) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }
  return <>{children}</>;
}
