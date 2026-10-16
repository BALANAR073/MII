import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { App } from '../app/App';
import { ToastProvider } from '../components/ui/Toast';
import { configureMockApi, resetMockDb } from '../mocks/mockApi';
import { resetMockAuth } from '../mocks/mockAuth';
import { setLogSilent } from '../lib/logger';
import { AuthProvider } from '../app/AuthProvider';

/** Возвращает mock-API в исходное состояние: демо-данные, без задержки и без ошибок. */
export function resetApi(): void {
  setLogSilent(true);
  resetMockAuth('borya');
  resetMockDb();
  configureMockApi({ latencyMs: 0, failNext: null, failUntilKind: null, failUntil: 0 });
}

/**
 * Рендерит всё приложение на нужном адресе — для сценарных тестов экранов.
 * @param route Начальный адрес.
 * @returns Результат render и экземпляр userEvent.
 */
export function renderApp(route: string) {
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>,
  );
  return { user, ...result };
}

/**
 * Рендерит компонент внутри провайдера уведомлений и роутера.
 * @param ui Компонент.
 * @returns Результат render и экземпляр userEvent.
 */
export function renderWithProviders(ui: ReactElement) {
  const user = userEvent.setup();
  const result = render(
    <MemoryRouter>
      <AuthProvider>
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { user, ...result };
}
