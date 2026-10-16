import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { IS_SUPABASE } from './api';
import { App } from './app/App';
import { enableRemoteLogging, installGlobalErrorHandlers } from './lib/logger';
import { initMetrika } from './lib/metrika';
import { applyDemoMode } from './mocks/demoMode';
import './index.css';

// Демо-режимы ?mock=… имеют смысл только без бэкенда.
if (!IS_SUPABASE) {
  applyDemoMode(window.location.search);
}

installGlobalErrorHandlers(window);
// Ошибки уходят на сервер только из выложенной версии: в разработке они видны в консоли (ДЗ6).
if (import.meta.env.PROD && IS_SUPABASE) {
  enableRemoteLogging('/api/log', import.meta.env.VITE_APP_RELEASE ?? 'dev');
}
// Метрика — только в выложенной версии: локальные запуски не портят статистику.
if (import.meta.env.PROD) {
  initMetrika(import.meta.env.VITE_YM_COUNTER_ID);
}

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Не найден элемент #root в index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
