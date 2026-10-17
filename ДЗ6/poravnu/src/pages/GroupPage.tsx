import { Suspense, useMemo, useState } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';
import { Skeleton, SkeletonList } from '../components/ui/Skeleton';
import { StatusMessage } from '../components/ui/StatusMessage';
import { FOCUS_RING, PRIMARY_LINK } from '../components/ui/styles';
import { BalancesPanel } from '../features/balances/BalancesPanel';
import type { SuggestedTransfer } from '../features/balances/types';
import { useSettlement } from '../features/balances/useSettlement';
import { ExpenseList } from '../features/expenses/ExpenseList';
import { useDeferredDelete } from '../features/expenses/useDeferredDelete';
import { useOptimisticExpenses } from '../features/expenses/useOptimisticExpenses';
import { GroupHeader } from '../features/groups/GroupHeader';
import { GroupTabs, type GroupTab } from '../features/groups/GroupTabs';
import { useGroupActions } from '../features/groups/useGroupActions';
import { useGroup } from '../features/groups/useGroups';
import { TransferDialog } from '../features/transfers/TransferDialog';
import { apiErrorMessage } from '../lib/apiErrorMessage';
import { cx } from '../lib/cx';
import { ApiError } from '../types/api';
import { useCurrentUser } from '../app/AuthProvider';
import type { GroupDetails } from '../types/group';
import type { GroupOutletContext } from './groupOutlet';

/** Экран «Группа» (US-04, 06, 07, 08): загрузка, ошибки и данные группы. */
export function GroupPage() {
  const { groupId = '' } = useParams();
  const { state, refreshFailed, reload } = useGroup(groupId);

  if (state.status === 'loading') {
    return <GroupPageSkeleton />;
  }
  if (state.status === 'error') {
    const unavailable = state.error instanceof ApiError && (state.error.kind === 'forbidden' || state.error.kind === 'not-found');
    return (
      <div className="px-4 py-6">
        <StatusMessage
          tone="error"
          title={unavailable ? 'Группа недоступна' : 'Не удалось загрузить группу'}
          description={apiErrorMessage(state.error, 'load')}
          action={
            unavailable ? (
              <Link to="/" className={PRIMARY_LINK}>
                К моим группам
              </Link>
            ) : (
              <Button onClick={reload}>Повторить</Button>
            )
          }
        />
      </div>
    );
  }
  return <GroupView key={groupId} details={state.data} reload={reload} refreshFailed={refreshFailed} />;
}

interface GroupViewProps {
  details: GroupDetails;
  reload: () => void;
  refreshFailed: boolean;
}

function GroupView({ details, reload, refreshFailed }: GroupViewProps) {
  const { group } = details;
  const currentUserId = useCurrentUser().id;
  const [tab, setTab] = useState<GroupTab>('expenses');
  const [transferToMark, setTransferToMark] = useState<SuggestedTransfer | null>(null);
  const [highlightMine, setHighlightMine] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const { inviteFriends, inviting, leaveCurrentGroup, leaving } = useGroupActions(group);
  const { hiddenIds, requestDelete } = useDeferredDelete(group.id, reload);
  const optimistic = useOptimisticExpenses(group.id, details.expenses, currentUserId, reload);

  // Удаляемые расходы скрыты сразу — балансы пересчитываются без них (AC-09.2).
  const visibleExpenses = useMemo(
    () => optimistic.expenses.filter((expense) => !hiddenIds.has(expense.id)),
    [optimistic.expenses, hiddenIds],
  );
  const ledger = useMemo(
    () => ({ members: details.members, expenses: visibleExpenses, transfers: details.transfers }),
    [details.members, details.transfers, visibleExpenses],
  );
  const settlementResult = useSettlement(ledger);

  const outletContext = useMemo<GroupOutletContext>(
    () => ({ details: { ...details, expenses: visibleExpenses }, createExpense: optimistic.createExpense, reload, requestDelete }),
    [details, visibleExpenses, optimistic.createExpense, reload, requestDelete],
  );

  if (!settlementResult.ok) {
    return (
      <div className="px-4 py-6">
        <StatusMessage
          tone="error"
          title="Не удалось посчитать балансы"
          description="Что-то пошло не так. Мы уже разбираемся"
          action={<Button onClick={reload}>Повторить</Button>}
        />
      </div>
    );
  }
  const { settlement } = settlementResult;
  const myBalanceKop = settlement.balances.find((balance) => balance.memberId === currentUserId)?.balanceKop ?? 0;

  // «Рассчитаться» (решение Q3): один свой перевод — сразу диалог, несколько — вкладка «Балансы».
  const handleSettle = () => {
    const mine = settlement.transfers.filter((transfer) => transfer.fromId === currentUserId);
    const [only] = mine;
    if (mine.length === 1 && only !== undefined) {
      setTransferToMark(only);
      return;
    }
    setTab('balances');
    setHighlightMine(true);
  };

  return (
    <div className="pb-24 lg:pb-8">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-4">
          <GroupHeader
            group={group}
            currentUserId={currentUserId}
            myBalanceKop={myBalanceKop}
            inviting={inviting}
            onSettle={handleSettle}
            onInvite={() => void inviteFriends()}
            onLeave={() => setConfirmLeave(true)}
          />
          {refreshFailed && (
            <div role="status" className="flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-900">
              Не удалось обновить данные — показана последняя версия.
              <Button variant="ghost" onClick={reload}>
                Обновить
              </Button>
            </div>
          )}
          <GroupTabs value={tab} onChange={setTab} />
          <section
            id="panel-expenses"
            role="tabpanel"
            aria-labelledby="tab-expenses"
            className={cx('bg-white sm:rounded-xl', tab !== 'expenses' && 'hidden lg:block')}
          >
            <div className="flex items-center justify-between px-4 pb-1 pt-4">
              <h2 className="text-base font-semibold text-slate-900">
                Расходы <span className="font-normal text-slate-500">{visibleExpenses.length}</span>
              </h2>
              <Link to="expenses/new" className={cx(PRIMARY_LINK, 'hidden lg:inline-flex')}>
                + Расход
              </Link>
            </div>
            {visibleExpenses.length === 0 ? (
              <StatusMessage
                tone="empty"
                icon="🧾"
                title="Пока все в расчёте"
                description="Добавьте первый расход — приложение само посчитает, кто кому должен."
                action={
                  <Link to="expenses/new" className={PRIMARY_LINK}>
                    Добавить расход
                  </Link>
                }
              />
            ) : (
              <ExpenseList
                expenses={visibleExpenses}
                members={group.members}
                currentUserId={currentUserId}
                pendingIds={optimistic.pendingIds}
              />
            )}
          </section>
        </div>

        {/* div, а не aside: у aside нельзя переопределить роль на tabpanel — нарушение нашёл axe-core (баг 11). */}
        <div
          id="panel-balances"
          role="tabpanel"
          aria-labelledby="tab-balances"
          className={cx('mt-4 space-y-4 lg:sticky lg:top-20 lg:mt-0 lg:block', tab !== 'balances' && 'hidden')}
        >
          <BalancesPanel
            members={group.members}
            settlement={settlement}
            expensesCount={visibleExpenses.length}
            currentUserId={currentUserId}
            highlightTransfers={highlightMine}
            onMarkTransfer={setTransferToMark}
          />
        </div>
      </div>

      <Link
        to="expenses/new"
        aria-label="Добавить расход"
        className={cx(
          // На вкладке «Балансы» кнопка не нужна и закрывала суммы (баг 3).
          tab !== 'expenses' && 'hidden',
          'fixed bottom-6 right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-3xl text-white shadow-lg hover:bg-emerald-800 lg:hidden',
          FOCUS_RING,
        )}
      >
        <span aria-hidden="true">+</span>
      </Link>

      {transferToMark !== null && (
        <TransferDialog
          groupId={group.id}
          transfer={transferToMark}
          members={group.members}
          onClose={() => setTransferToMark(null)}
          onDone={() => {
            setTransferToMark(null);
            reload();
          }}
        />
      )}

      {confirmLeave && (
        <Dialog title="Выйти из группы?" onClose={() => setConfirmLeave(false)}>
          <p className="text-sm text-slate-700">
            Группа пропадёт из вашего списка. Выйти можно, только если вы в расчёте. Вернуться можно по ссылке-приглашению.
          </p>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={() => setConfirmLeave(false)}>
              Остаться
            </Button>
            <Button
              variant="danger"
              pending={leaving}
              onClick={() => {
                void leaveCurrentGroup().then((left) => {
                  if (!left) {
                    setConfirmLeave(false);
                  }
                });
              }}
            >
              Выйти
            </Button>
          </div>
        </Dialog>
      )}

      {/* Форма расхода — отдельный файл; пока он грузится, лента группы остаётся на экране. */}
      <Suspense fallback={null}>
        <Outlet context={outletContext} />
      </Suspense>
    </div>
  );
}

function GroupPageSkeleton() {
  return (
    <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6 lg:space-y-0 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div role="status" className="space-y-3 bg-white px-4 py-5 sm:rounded-xl">
          <span className="sr-only">Загружаем группу…</span>
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-10 w-48" />
        </div>
        <SkeletonList rows={4} label="Загружаем расходы…" />
      </div>
      <div className="hidden lg:block">
        <SkeletonList rows={3} label="Загружаем балансы…" />
      </div>
    </div>
  );
}
