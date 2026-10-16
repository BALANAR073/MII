import { Route, Routes } from 'react-router-dom';
import { ToastProvider } from '../components/ui/Toast';
import { ExpenseDialog } from '../features/expenses/ExpenseDialog';
import { GroupPage } from '../pages/GroupPage';
import { GroupsPage } from '../pages/GroupsPage';
import { HistoryPage } from '../pages/HistoryPage';
import { JoinPage, NotFoundPage } from '../pages/SimplePages';
import { AppLayout } from './AppLayout';

/**
 * Маршруты приложения (ТЗ, раздел 1). Форма расхода — вложенный маршрут экрана группы,
 * поэтому на десктопе она открывается модальным окном поверх ленты.
 */
export function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<GroupsPage />} />
          <Route path="groups/:groupId" element={<GroupPage />}>
            <Route path="expenses/new" element={<ExpenseDialog />} />
            <Route path="expenses/:expenseId" element={<ExpenseDialog />} />
          </Route>
          <Route path="groups/:groupId/history" element={<HistoryPage />} />
          <Route path="join/:token" element={<JoinPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}
