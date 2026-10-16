import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './app/App';
import { applyDemoMode } from './mocks/demoMode';
import './index.css';

applyDemoMode(window.location.search);

const container = document.getElementById('root');
if (container === null) {
  throw new Error('Не найден элемент #root в index.html');
}

createRoot(container).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
