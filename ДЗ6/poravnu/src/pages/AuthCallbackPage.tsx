import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import { safeNext } from '../lib/safeNext';

/**
 * Возврат от провайдера OAuth (Google). supabase-js сам обменивает одноразовый `code` на сессию
 * при запуске (PKCE), а страница ждёт результата: вошли — на `next`, ошибка — понятный текст (ДЗ6).
 */
export function AuthCallbackPage() {
  const { state } = useAuth();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const providerError = params.get('error_description') ?? params.get('error');

  if (providerError === null && state.status === 'ready' && state.user !== null) {
    return <Navigate to={next} replace />;
  }

  if (providerError !== null || state.status === 'ready') {
    return (
      <div className="mx-auto max-w-sm px-4 py-10">
        <h1 className="text-2xl font-semibold text-slate-900">Не удалось войти</h1>
        <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {providerError === null ? 'Вход не завершён. Попробуйте ещё раз.' : 'Вход отменён или провайдер вернул ошибку. Попробуйте ещё раз.'}
        </p>
        <Link
          to={`/login${next === '/' ? '' : `?next=${encodeURIComponent(next)}`}`}
          className="mt-6 inline-block font-semibold text-emerald-800 underline"
        >
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <p role="status" className="px-4 py-10 text-center text-slate-600">
      Завершаем вход…
    </p>
  );
}
