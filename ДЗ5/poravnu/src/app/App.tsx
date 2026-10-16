import { Outlet, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { ExpenseDialog } from '../features/expenses/ExpenseDialog';
import { GroupPage } from '../pages/GroupPage';
import { GroupsPage } from '../pages/GroupsPage';
import { HistoryPage } from '../pages/HistoryPage';
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
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="register" element={<AuthPage mode="register" />} />
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
