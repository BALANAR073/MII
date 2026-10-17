import { lazy, useEffect, useRef } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { trackPageView } from '../lib/metrika';
import { GroupsPage } from '../pages/GroupsPage';
import { AuthPage } from '../pages/AuthPage';
import { NotFoundPage } from '../pages/SimplePages';
import { AppLayout } from './AppLayout';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';

// Экраны, которые нужны не на первом показе, грузятся отдельными файлами (ДЗ6, оптимизация):
// стартовый бандл — вход и «Мои группы».
const GroupPage = lazy(() => import('../pages/GroupPage').then((m) => ({ default: m.GroupPage })));
const HistoryPage = lazy(() => import('../pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const JoinPage = lazy(() => import('../pages/JoinPage').then((m) => ({ default: m.JoinPage })));
const AuthCallbackPage = lazy(() => import('../pages/AuthCallbackPage').then((m) => ({ default: m.AuthCallbackPage })));
const PrivacyPage = lazy(() => import('../pages/PrivacyPage').then((m) => ({ default: m.PrivacyPage })));
const ExpenseDialog = lazy(() => import('../features/expenses/ExpenseDialog').then((m) => ({ default: m.ExpenseDialog })));

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
            {/* Открыта без входа: ссылка на неё обязательна для публикации Google OAuth (ДЗ6). */}
            <Route path="privacy" element={<PrivacyPage />} />
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
