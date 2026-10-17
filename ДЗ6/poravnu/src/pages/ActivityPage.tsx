import { useMemo, useState, type ReactNode } from 'react';
import { useCurrentUser } from '../app/AuthProvider';
import { Button } from '../components/ui/Button';
import { SkeletonList } from '../components/ui/Skeleton';
import { StatusMessage } from '../components/ui/StatusMessage';
import { ActivityFeed } from '../features/dashboard/ActivityFeed';
import { useDashboard } from '../features/dashboard/useDashboard';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import { cx } from '../lib/cx';

const ACTIVITY_LIMIT = 200;
const ALL_GROUPS = 'all';

/** Вся активность (ДЗ6): расходы и переводы по всем группам с фильтром по группе. */
export function ActivityPage() {
  const me = useCurrentUser();
  const { state, reload } = useDashboard(me.id, 0, ACTIVITY_LIMIT);
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS);

  const items = useMemo(() => {
    if (state.status !== 'success') {
      return [];
    }
    const all = state.data.dashboard.activity;
    return groupFilter === ALL_GROUPS ? all : all.filter((item) => item.groupId === groupFilter);
  }, [state, groupFilter]);

  return (
    <div className="mx-auto max-w-3xl pb-10">
      <h1 className="px-4 pb-4 pt-6 text-2xl font-semibold text-slate-900 sm:px-0">Активность</h1>
      {state.status === 'loading' && <SkeletonList rows={5} label="Загружаем операции…" />}
      {state.status === 'error' && (
        <StatusMessage
          tone="error"
          title="Не удалось загрузить операции"
          description={apiErrorMessage(state.error, 'load')}
          action={<Button onClick={reload}>Повторить</Button>}
        />
      )}
      {state.status === 'success' && (
        <>
          {state.data.groups.length > 1 && (
            <div role="group" aria-label="Фильтр по группе" className="flex gap-2 overflow-x-auto px-4 pb-3 sm:px-0">
              <FilterChip active={groupFilter === ALL_GROUPS} onClick={() => setGroupFilter(ALL_GROUPS)}>
                Все группы
              </FilterChip>
              {state.data.groups.map((group) => (
                <FilterChip key={group.id} active={groupFilter === group.id} onClick={() => setGroupFilter(group.id)}>
                  <span aria-hidden="true">{group.emoji}</span> {group.name}
                </FilterChip>
              ))}
            </div>
          )}
          {items.length === 0 ? (
            <StatusMessage
              tone="empty"
              icon="🧾"
              title="Операций пока нет"
              description="Здесь появятся расходы и переводы из ваших групп."
            />
          ) : (
            <section className="bg-white sm:rounded-xl">
              <ActivityFeed items={items} showGroup={groupFilter === ALL_GROUPS} />
            </section>
          )}
        </>
      )}
    </div>
  );
}

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}

function FilterChip({ active, onClick, children }: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'min-h-9 shrink-0 whitespace-nowrap rounded-xl border px-3 text-sm font-medium',
        active ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}
