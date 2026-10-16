import { useEffect, useRef } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { ExpenseDialog } from '../features/expenses/ExpenseDialog';
import { trackPageView } from '../lib/metrika';
import { GroupPage } from '../pages/GroupPage';
import { GroupsPage } from '../pages/GroupsPage';
import { HistoryPage } from '../pages/HistoryPage';
import { AuthCallbackPage } from '../pages/AuthCallbackPage';
import { AuthPage } from '../pages/AuthPage';
import { JoinPage } from '../pages/JoinPage';
import { NotFoundPage } from '../pages/SimplePages';
import { AppLayout } from './AppLayout';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';

/**
 * Маршруты приложения (ТЗ, раздел 1). Форма расхода — вложенный маршрут экрана группы,
 * поэтому на десктопе она открывается модальным окном поверх ленты.
 */
export function App() {
  usePageViews();
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="register" element={<AuthPage mode="register" />} />
            <Route path="auth/callback" element={<AuthCallbackPage />} />
            {/* Приглашение открывается и без входа: гость видит превью (FR-1.2, FR-2.3). */}
            <Route path="join/:token" element={<JoinPage />} />
            <Route element={<Protected />}>
              <Route index element={<GroupsPage />} />
              <Route path="groups/:groupId" element={<GroupPage />}>
                <Route path="expenses/new" element={<ExpenseDialog />} />
                <Route path="expenses/:expenseId" element={<ExpenseDialog />} />
              </Route>
              <Route path="groups/:groupId/history" element={<HistoryPage />} />
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}

function Protected() {
  return (
    <RequireAuth>
      <Outlet />
    </RequireAuth>
  );
}

/** Просмотры страниц для Яндекс.Метрики: в SPA адрес меняется без перезагрузки (ДЗ6). */
function usePageViews(): void {
  const location = useLocation();
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    const url = location.pathname + location.search;
    if (previous.current !== undefined && previous.current !== url) {
      trackPageView(url, previous.current);
    }
    previous.current = url;
  }, [location.pathname, location.search]);
}
