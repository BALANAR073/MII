import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '../app/AuthProvider';
import { useMutation } from '../app/useMutation';
import { Avatar } from '../components/ui/Avatar';
import { Button } from '../components/ui/Button';
import { Skeleton, SkeletonList } from '../components/ui/Skeleton';
import { StatusMessage } from '../components/ui/StatusMessage';
import { useToast } from '../components/ui/Toast';
import { ActivityFeed } from '../features/dashboard/ActivityFeed';
import type { Dashboard, PersonDebt } from '../features/dashboard/computeDashboard';
import { createSampleGroup } from '../features/dashboard/sampleGroup';
import { useDashboard } from '../features/dashboard/useDashboard';
import { CreateGroupDialog } from '../features/groups/CreateGroupDialog';
import { GroupList } from '../features/groups/GroupList';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import { cx } from '../lib/cx';
import { formatRub } from '../lib/money';
import { plural, toDative } from '../lib/russian';

const MONTH_NAMES = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

/**
 * Главная (ДЗ6): сводка по всем группам — сколько должны мне и сколько я, с кем конкретно,
 * мои траты за месяц, группы и последние операции. Новому пользователю — короткий старт и «пример группы».
 */
export function HomePage() {
  const me = useCurrentUser();
  const [refreshKey, setRefreshKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const { state, reload } = useDashboard(me.id, refreshKey);
  const navigate = useNavigate();
  const sample = useMutation();
  const { showToast } = useToast();

  const trySample = async () => {
    try {
      const groupId = await sample.run(() => createSampleGroup(me.id));
      if (groupId !== undefined) {
        showToast({ message: 'Пример готов — смотрите балансы и статистику', tone: 'success' });
        navigate(`/groups/${groupId}`);
      }
    } catch (caught) {
      showToast({ message: apiErrorMessage(caught, 'save'), tone: 'error' });
      setRefreshKey((key) => key + 1);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 pb-10 pt-6 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Привет, {me.name}!</h1>
          <p className="mt-1 text-sm text-slate-600">Общие расходы и долги по всем вашим группам.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Создать группу</Button>
      </div>

      {state.status === 'loading' && <HomeSkeleton />}
      {state.status === 'error' && (
        <StatusMessage
          tone="error"
          title="Не удалось загрузить сводку"
          description={apiErrorMessage(state.error, 'load')}
          action={<Button onClick={reload}>Повторить</Button>}
        />
      )}
      {state.status === 'success' &&
        (state.data.groups.length === 0 ? (
          <Welcome onCreate={() => setCreating(true)} onSample={() => void trySample()} sampling={sample.pending} />
        ) : (
          <>
            <Summary dashboard={state.data.dashboard} />
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <section aria-labelledby="people-title" className="bg-white sm:rounded-xl">
                <h2 id="people-title" className="px-4 pb-2 pt-4 text-base font-semibold text-slate-900">
                  С кем расчёты
                </h2>
                {state.data.dashboard.people.length === 0 ? (
                  <p className="px-4 pb-6 pt-2 text-sm text-slate-600">Вы со всеми в расчёте 🎉</p>
                ) : (
                  <PeopleList people={state.data.dashboard.people} />
                )}
              </section>
              <section aria-labelledby="groups-title" className="bg-white sm:rounded-xl">
                <div className="flex items-center justify-between px-4 pb-1 pt-4">
                  <h2 id="groups-title" className="text-base font-semibold text-slate-900">
                    Группы <span className="font-normal text-slate-500">{state.data.groups.length}</span>
                  </h2>
                  <Link to="/groups" className="text-sm font-medium text-emerald-800 hover:underline">
                    Все группы
                  </Link>
                </div>
                <GroupList groups={state.data.groups.slice(0, 5)} />
              </section>
            </div>
            <section aria-labelledby="activity-title" className="bg-white sm:rounded-xl">
              <div className="flex items-center justify-between px-4 pb-1 pt-4">
                <h2 id="activity-title" className="text-base font-semibold text-slate-900">
                  Последние операции
                </h2>
                <Link to="/activity" className="text-sm font-medium text-emerald-800 hover:underline">
                  Вся активность
                </Link>
              </div>
              {state.data.dashboard.activity.length === 0 ? (
                <p className="px-4 pb-6 pt-2 text-sm text-slate-600">Расходов пока нет — откройте группу и добавьте первый.</p>
              ) : (
                <ActivityFeed items={state.data.dashboard.activity} />
              )}
            </section>
          </>
        ))}

      {creating && (
        <CreateGroupDialog
          onClose={() => setCreating(false)}
          onCreated={(group) => {
            setCreating(false);
            navigate(`/groups/${group.id}`);
          }}
        />
      )}
    </div>
  );
}

interface SummaryProps {
  dashboard: Dashboard;
}

function Summary({ dashboard }: SummaryProps) {
  const month = MONTH_NAMES[new Date().getMonth()] ?? '';
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <div className="rounded-xl bg-white px-4 py-4">
        <dt className="text-sm text-slate-600">Вам должны</dt>
        <dd
          className={cx(
            'mt-1 text-xl sm:text-2xl font-semibold tabular-nums',
            dashboard.owedToMeKop > 0 ? 'text-emerald-700' : 'text-slate-500',
          )}
        >
          {formatRub(dashboard.owedToMeKop)}
        </dd>
      </div>
      <div className="rounded-xl bg-white px-4 py-4">
        <dt className="text-sm text-slate-600">Вы должны</dt>
        <dd
          className={cx('mt-1 text-xl sm:text-2xl font-semibold tabular-nums', dashboard.iOweKop > 0 ? 'text-rose-600' : 'text-slate-500')}
        >
          {formatRub(dashboard.iOweKop)}
        </dd>
      </div>
      <div className="col-span-2 rounded-xl bg-white px-4 py-4 sm:col-span-1">
        <dt className="text-sm text-slate-600">Ваши траты в {month}</dt>
        <dd className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums text-slate-900">{formatRub(dashboard.mySpentThisMonthKop)}</dd>
        <dd className="mt-0.5 text-xs text-slate-500">
          ваша доля в расходах · {dashboard.groupsCount} {plural(dashboard.groupsCount, ['группа', 'группы', 'групп'])}
        </dd>
      </div>
    </dl>
  );
}

interface PeopleListProps {
  people: readonly PersonDebt[];
}

/** Люди, с которыми есть долги, по всем группам: суммы сложены, под именем — в каких группах. */
function PeopleList({ people }: PeopleListProps) {
  return (
    <ul className="divide-y divide-slate-100" aria-label="С кем расчёты">
      {people.map((person, index) => {
        const owesMe = person.netKop > 0;
        const [first] = person.groups;
        return (
          <li key={person.key}>
            <Link
              to={first === undefined ? '/groups' : `/groups/${first.groupId}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"
            >
              <Avatar name={person.name} index={index} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {owesMe ? `${person.name} — вам` : `Вы — ${toDative(person.name)}`}
                </span>
                <span className="mt-0.5 block truncate text-xs text-slate-500">
                  {person.groups.map((group) => `${group.emoji} ${group.groupName}`).join(' · ')}
                </span>
              </span>
              <span className={cx('shrink-0 text-sm font-semibold tabular-nums', owesMe ? 'text-emerald-700' : 'text-rose-600')}>
                {owesMe ? '+' : '−'}
                {formatRub(Math.abs(person.netKop))}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface WelcomeProps {
  onCreate: () => void;
  onSample: () => void;
  sampling: boolean;
}

/** Первый вход: что делает сервис, три шага и «пример», чтобы не начинать с пустого экрана. */
function Welcome({ onCreate, onSample, sampling }: WelcomeProps) {
  const steps = [
    ['👥', 'Создайте группу', 'Поездка, квартира или праздник — и сразу впишите друзей по имени.'],
    ['🧾', 'Записывайте расходы', 'Кто платил и на кого делим — поровну или по долям, с категориями.'],
    ['🤝', 'Рассчитайтесь', 'Приложение покажет, кто кому сколько должен, — минимумом переводов.'],
  ] as const;
  return (
    <section className="rounded-xl bg-white px-4 py-6 sm:px-8 sm:py-8">
      <h2 className="text-xl font-semibold text-slate-900">Делите общие расходы без калькулятора</h2>
      <ol className="mt-5 grid gap-4 sm:grid-cols-3">
        {steps.map(([icon, title, text], index) => (
          <li key={title} className="rounded-xl bg-slate-50 px-4 py-4">
            <span aria-hidden="true" className="text-2xl">
              {icon}
            </span>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {index + 1}. {title}
            </p>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </li>
        ))}
      </ol>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Button onClick={onCreate}>Создать первую группу</Button>
        <Button variant="secondary" pending={sampling} onClick={onSample}>
          Попробовать на примере
        </Button>
      </div>
      <p className="mt-3 text-xs text-slate-500">Пример — обычная группа с выдуманными расходами: её можно изменить или выйти из неё.</p>
    </section>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6">
      <div role="status" className="grid gap-3 sm:grid-cols-3">
        <span className="sr-only">Загружаем сводку…</span>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <SkeletonList rows={3} label="Загружаем группы…" />
    </div>
  );
}
