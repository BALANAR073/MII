import { Suspense } from 'react';
import { Link, NavLink, Outlet, useMatch, useNavigate } from 'react-router-dom';
import { AnalyticsConsentBanner } from '../components/ui/AnalyticsConsentBanner';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { FOCUS_RING } from '../components/ui/styles';
import { GroupList } from '../features/groups/GroupList';
import { useGroups } from '../features/groups/useGroups';
import { cx } from '../lib/cx';
import { useAuth } from './AuthProvider';
import { useMediaQuery } from './useMediaQuery';

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

/** Разделы приложения (ДЗ6): в шапке на десктопе и нижней панелью на телефоне. */
const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Главная', icon: '🏠' },
  { to: '/groups', label: 'Группы', icon: '👥' },
  { to: '/activity', label: 'Активность', icon: '🧾' },
  { to: '/profile', label: 'Профиль', icon: '🙂' },
];

/**
 * Каркас приложения: верхняя панель с разделами, на телефоне — нижняя панель (ДЗ6),
 * на экранах группы от 1280 px — левая колонка со списком групп (концепция 3, NFR-1).
 * На 1024 px три колонки оставляли ленте ~340 px и подписи ломались (баг 8), поэтому там две.
 */
export function AppLayout() {
  const inGroup = useMatch('/groups/:groupId/*') !== null;
  // Панель групп монтируется только на широком экране: на телефоне она не нужна и не должна делать запрос.
  const isWide = useMediaQuery('(min-width: 1280px)');
  const { state } = useAuth();
  const signedIn = state.status === 'ready' && state.user !== null;

  return (
    <div className="min-h-screen bg-slate-50">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-2"
      >
        К содержимому
      </a>
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-4">
            <Link to="/" className={cx('flex items-center gap-2 rounded-xl font-semibold text-slate-900', FOCUS_RING)}>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-700 text-sm font-bold text-white"
              >
                =
              </span>
              ПоРовну
            </Link>
            {signedIn && (
              <nav aria-label="Основные разделы" className="hidden items-center gap-1 text-sm sm:flex">
                {NAV_ITEMS.filter((item) => item.to !== '/profile').map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.to === '/'} className={desktopNavClass}>
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>
          <UserMenu />
        </div>
      </header>

      <div className="mx-auto max-w-7xl sm:px-4 lg:flex lg:gap-6 lg:py-6">
        {inGroup && isWide && signedIn && <GroupsSidebar />}
        <main id="main" tabIndex={-1} className={cx('min-w-0 flex-1 outline-none sm:py-4 lg:py-0', signedIn && 'pb-16 sm:pb-0')}>
          {/* Экраны грузятся отдельными файлами: пока файл едет, шапка остаётся на месте. */}
          <Suspense
            fallback={
              <p role="status" className="px-4 py-10 text-center text-slate-500">
                Загрузка…
              </p>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      {signedIn && <BottomTabs />}
      <AnalyticsConsentBanner />
    </div>
  );
}

function GroupsSidebar() {
  const { state } = useGroups();
  return (
    <aside aria-label="Мои группы" className="w-60 shrink-0">
      <div className="sticky top-20 space-y-3">
        <Link to="/groups" className="block px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:text-slate-800">
          Мои группы
        </Link>
        {state.status === 'loading' && (
          <div className="space-y-2 px-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        )}
        {state.status === 'success' && <GroupList groups={state.data} compact />}
        {state.status === 'error' && <p className="px-3 text-sm text-slate-500">Список групп не загрузился</p>}
      </div>
    </aside>
  );
}

/** Вошедший пользователь — ссылка на профиль и выход (AC-T1.2); гостю — ссылка на вход. */
function UserMenu() {
  const { state, signOut } = useAuth();
  const navigate = useNavigate();
  if (state.status !== 'ready') {
    return null;
  }
  if (state.user === null) {
    return (
      <Link to="/login" className="rounded-xl px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-slate-100">
        Войти
      </Link>
    );
  }
  return (
    <span className="flex items-center gap-1 text-sm text-slate-700">
      <Link
        to="/profile"
        aria-label={`Профиль: ${state.user.name}`}
        className={cx('flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-slate-100', FOCUS_RING)}
      >
        <Avatar name={state.user.name} index={1} size="sm" />
        <span className="hidden max-w-32 truncate sm:inline">{state.user.name}</span>
      </Link>
      <Button
        variant="ghost"
        className="hidden px-2 sm:inline-flex"
        onClick={() => {
          void signOut().then(() => navigate('/login'));
        }}
      >
        Выйти
      </Button>
    </span>
  );
}

function desktopNavClass({ isActive }: { isActive: boolean }): string {
  return cx(
    'rounded-xl px-3 py-2 font-medium',
    FOCUS_RING,
    isActive ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700 hover:bg-slate-100',
  );
}

/** Нижняя панель разделов на телефоне (ДЗ6): до любого раздела — один тап. */
function BottomTabs() {
  return (
    <nav
      aria-label="Разделы"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white/95 backdrop-blur sm:hidden"
    >
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            cx(
              'flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium',
              FOCUS_RING,
              isActive ? 'text-emerald-800' : 'text-slate-600',
            )
          }
        >
          <span aria-hidden="true" className="text-lg leading-none">
            {item.icon}
          </span>
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
