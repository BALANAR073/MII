import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { formatRub } from '../../lib/money';
import { memberColorIndex } from '../../lib/memberColor';
import { toDative } from '../../lib/russian';
import type { Member, MemberId } from '../../types/group';
import type { SuggestedTransfer } from './types';

interface MyDebtsProps {
  members: readonly Member[];
  transfers: readonly SuggestedTransfer[];
  currentUserId: MemberId;
  onMark: (transfer: SuggestedTransfer) => void;
}

/**
 * «Мои расчёты» (ДЗ6): из плана переводов — только то, что касается меня. Кому и сколько я должен,
 * кто и сколько должен мне — с кнопкой отметить перевод прямо в строке, без поиска по общему списку.
 */
export function MyDebts({ members, transfers, currentUserId, onMark }: MyDebtsProps) {
  const iOwe = transfers.filter((transfer) => transfer.fromId === currentUserId);
  const owedToMe = transfers.filter((transfer) => transfer.toId === currentUserId);
  if (iOwe.length === 0 && owedToMe.length === 0) {
    return null;
  }
  const nameOf = (id: MemberId) => members.find((member) => member.id === id)?.name ?? 'Участник';

  return (
    <section aria-labelledby="my-debts-title" className="bg-white px-4 py-4 sm:rounded-xl">
      <h2 id="my-debts-title" className="text-base font-semibold text-slate-900">
        Мои расчёты
      </h2>
      {iOwe.length > 0 && (
        <>
          <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-700">Вы должны</h3>
          <ul className="mt-2 space-y-2">
            {iOwe.map((transfer) => (
              <DebtRow
                key={transfer.toId}
                name={nameOf(transfer.toId)}
                label={toDative(nameOf(transfer.toId))}
                index={memberColorIndex(members, transfer.toId)}
                amountKop={transfer.amountKop}
                tone="owe"
                actionLabel="Оплачено"
                onAction={() => onMark(transfer)}
              />
            ))}
          </ul>
        </>
      )}
      {owedToMe.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-emerald-700">Вам должны</h3>
          <ul className="mt-2 space-y-2">
            {owedToMe.map((transfer) => (
              <DebtRow
                key={transfer.fromId}
                name={nameOf(transfer.fromId)}
                label={nameOf(transfer.fromId)}
                index={memberColorIndex(members, transfer.fromId)}
                amountKop={transfer.amountKop}
                tone="owed"
                actionLabel="Мне вернули"
                onAction={() => onMark(transfer)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

interface DebtRowProps {
  name: string;
  /** Как подписать строку: «Ане» (кому я должен) или «Боря» (кто должен мне). */
  label: string;
  index: number;
  amountKop: number;
  tone: 'owe' | 'owed';
  actionLabel: string;
  onAction: () => void;
}

function DebtRow({ name, label, index, amountKop, tone, actionLabel, onAction }: DebtRowProps) {
  return (
    <li
      className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${tone === 'owe' ? 'border-rose-100 bg-rose-50/60' : 'border-emerald-100 bg-emerald-50/60'}`}
    >
      <Avatar name={name} index={index} size="sm" />
      <p className="min-w-0 flex-1 truncate text-sm text-slate-800">{label}</p>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${tone === 'owe' ? 'text-rose-700' : 'text-emerald-700'}`}>
        {formatRub(amountKop)}
      </span>
      <Button
        variant="secondary"
        className="min-h-9 shrink-0 px-3"
        onClick={onAction}
        aria-label={`${actionLabel}: ${name}, ${formatRub(amountKop)}`}
      >
        {actionLabel}
      </Button>
    </li>
  );
}
