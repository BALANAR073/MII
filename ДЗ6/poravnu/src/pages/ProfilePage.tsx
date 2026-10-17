import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useCurrentUser } from '../app/AuthProvider';
import { useMutation } from '../app/useMutation';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { DeleteAccountDialog } from '../features/auth/DeleteAccountDialog';
import { isDemoEmail } from '../features/auth/demoAccounts';
import { useDashboard } from '../features/dashboard/useDashboard';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import { getAnalyticsConsent, isMetrikaConfigured, setAnalyticsConsent, subscribeAnalyticsConsent } from '../lib/metrika';
import { formatRub } from '../lib/money';

const NAME_MAX = 40;

/** Профиль (ДЗ6): имя, сводка по моим тратам, согласие на статистику, политика, выход и удаление аккаунта. */
export function ProfilePage() {
  const me = useCurrentUser();
  const { updateName, signOut } = useAuth();
  const [name, setName] = useState(me.name);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const save = useMutation();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { state } = useDashboard(me.id);
  const consent = useSyncExternalStore(subscribeAnalyticsConsent, getAnalyticsConsent, () => null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed === '') {
      setError('Введите имя');
      return;
    }
    setError(null);
    try {
      const user = await save.run(() => updateName(trimmed));
      if (user !== undefined) {
        showToast({ message: 'Имя сохранено', tone: 'success' });
      }
    } catch (caught) {
      setError(apiErrorMessage(caught, 'save'));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-10 pt-6 sm:px-0">
      <div className="flex items-center gap-4">
        <Avatar name={me.name} index={1} />
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold text-slate-900">{me.name}</h1>
          <p className="truncate text-sm text-slate-600">{me.email}</p>
        </div>
      </div>

      {state.status === 'success' && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Групп" value={String(state.data.dashboard.groupsCount)} />
          <Metric label="Вы оплатили всего" value={formatRub(state.data.dashboard.myPaidTotalKop)} />
          <Metric label="Вам должны" value={formatRub(state.data.dashboard.owedToMeKop)} />
          <Metric label="Вы должны" value={formatRub(state.data.dashboard.iOweKop)} />
        </dl>
      )}

      <section aria-labelledby="name-title" className="rounded-xl bg-white px-4 py-4">
        <h2 id="name-title" className="text-base font-semibold text-slate-900">
          Имя
        </h2>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={(event) => void submit(event)} noValidate>
          <div className="flex-1">
            <label htmlFor="profile-name" className="sr-only">
              Как вас видят в группах
            </label>
            <input
              id="profile-name"
              value={name}
              maxLength={NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? 'profile-name-error' : 'profile-name-hint'}
              className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-slate-900 focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700/30"
            />
            {error !== null ? (
              <p id="profile-name-error" role="alert" className="mt-1 text-sm text-rose-600">
                {error}
              </p>
            ) : (
              <p id="profile-name-hint" className="mt-1 text-xs text-slate-500">
                Так вас видят участники всех групп.
              </p>
            )}
          </div>
          <Button type="submit" pending={save.pending} disabled={name.trim() === me.name}>
            Сохранить
          </Button>
        </form>
      </section>

      {isMetrikaConfigured() && (
        <section aria-labelledby="stats-title" className="rounded-xl bg-white px-4 py-4">
          <h2 id="stats-title" className="text-base font-semibold text-slate-900">
            Статистика посещений
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {consent === 'granted'
              ? 'Вы разрешили обезличенную статистику (Яндекс.Метрика).'
              : 'Статистика посещений выключена — счётчик не загружается.'}
          </p>
          <Button variant="secondary" className="mt-3" onClick={() => setAnalyticsConsent(consent === 'granted' ? 'denied' : 'granted')}>
            {consent === 'granted' ? 'Выключить' : 'Разрешить'}
          </Button>
        </section>
      )}

      <section className="flex flex-col gap-2 rounded-xl bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/privacy" className="text-sm font-medium text-emerald-800 hover:underline">
          Политика конфиденциальности
        </Link>
        <Button
          variant="secondary"
          onClick={() => {
            void signOut().then(() => navigate('/login'));
          }}
        >
          Выйти из аккаунта
        </Button>
      </section>

      <section aria-labelledby="danger-title" className="rounded-xl border border-rose-200 bg-white px-4 py-4">
        <h2 id="danger-title" className="text-base font-semibold text-slate-900">
          Удаление аккаунта
        </h2>
        {isDemoEmail(me.email) ? (
          <p className="mt-1 text-sm text-slate-600">
            Это общий демо-аккаунт — его удалить нельзя, иначе вход «в один клик» перестанет работать.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600">
              Профиль удалится навсегда. Перед этим загляните в группы — может, стоит рассчитаться.
            </p>
            <Button variant="danger" className="mt-3" onClick={() => setDeleting(true)}>
              Удалить аккаунт
            </Button>
          </>
        )}
      </section>
      {deleting && <DeleteAccountDialog onClose={() => setDeleting(false)} />}
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-xl bg-white px-4 py-3">
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd className="mt-1 truncate text-lg font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}
