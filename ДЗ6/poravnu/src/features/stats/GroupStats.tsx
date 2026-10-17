import { useMemo } from 'react';
import { Avatar } from '../../components/ui/Avatar';
import { StatusMessage } from '../../components/ui/StatusMessage';
import { formatRub } from '../../lib/money';
import { memberColorIndex } from '../../lib/memberColor';
import { plural } from '../../lib/russian';
import type { Expense, Member } from '../../types/group';
import { computeGroupStats, formatMonth } from './groupStats';

interface GroupStatsProps {
  expenses: readonly Expense[];
  members: readonly Member[];
}

/**
 * Вкладка «Статистика» (ДЗ6): итоги, траты по категориям, кто сколько заплатил и потратил, траты по месяцам.
 * Полоски — обычные блоки Tailwind: библиотека графиков ради трёх диаграмм не нужна (правило 14).
 */
export function GroupStats({ expenses, members }: GroupStatsProps) {
  const stats = useMemo(() => computeGroupStats(expenses, members), [expenses, members]);

  if (stats.count === 0) {
    return (
      <StatusMessage
        tone="empty"
        icon="📊"
        title="Статистики пока нет"
        description="Добавьте несколько расходов — здесь появятся траты по категориям и участникам."
      />
    );
  }

  const maxMember = Math.max(1, ...stats.byMember.flatMap((item) => [item.paidKop, item.spentKop]));
  const maxMonth = Math.max(1, ...stats.byMonth.map((item) => item.totalKop));
  const nameOf = (id: string) => members.find((member) => member.id === id)?.name ?? 'Участник';

  return (
    <div className="space-y-6 px-4 py-4">
      <dl className="grid grid-cols-3 gap-2">
        <Metric label="Всего" value={formatRub(stats.totalKop)} />
        <Metric label="Средний расход" value={formatRub(stats.averageKop)} />
        <Metric
          label="Самый крупный"
          value={stats.biggest === null ? '—' : formatRub(stats.biggest.amountKop)}
          hint={stats.biggest?.title}
        />
      </dl>

      <section aria-labelledby="stats-categories">
        <h3 id="stats-categories" className="mb-3 text-sm font-semibold text-slate-900">
          По категориям
        </h3>
        <ul className="space-y-3">
          {stats.byCategory.map((item) => (
            <li key={item.category.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-slate-800">
                  <span aria-hidden="true">{item.category.emoji}</span> {item.category.label}{' '}
                  <span className="text-slate-500">
                    · {item.count} {plural(item.count, ['расход', 'расхода', 'расходов'])}
                  </span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                  {formatRub(item.totalKop)} <span className="font-normal text-slate-500">{item.percent}%</span>
                </span>
              </div>
              <Bar percent={(item.totalKop / stats.totalKop) * 100} className={item.category.barClass} />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="stats-members">
        <h3 id="stats-members" className="mb-1 text-sm font-semibold text-slate-900">
          Кто сколько заплатил и потратил
        </h3>
        <p className="mb-3 flex gap-4 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-emerald-600" /> заплатил
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="h-2 w-3 rounded-sm bg-slate-400" /> потратил на себя
          </span>
        </p>
        <ul className="space-y-3">
          {stats.byMember.map((item) => (
            <li key={item.memberId} className="flex items-center gap-3">
              <Avatar name={nameOf(item.memberId)} index={memberColorIndex(members, item.memberId)} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="truncate text-slate-800">{nameOf(item.memberId)}</span>
                  <span className="shrink-0 tabular-nums text-slate-600">
                    <span className="font-semibold text-slate-900">{formatRub(item.paidKop)}</span> / {formatRub(item.spentKop)}
                  </span>
                </div>
                <Bar percent={(item.paidKop / maxMember) * 100} className="bg-emerald-600" label={`Заплатил ${formatRub(item.paidKop)}`} />
                <Bar percent={(item.spentKop / maxMember) * 100} className="bg-slate-400" label={`Потратил ${formatRub(item.spentKop)}`} />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {stats.byMonth.length > 1 && (
        <section aria-labelledby="stats-months">
          <h3 id="stats-months" className="mb-3 text-sm font-semibold text-slate-900">
            По месяцам
          </h3>
          <ul className="space-y-2">
            {stats.byMonth.map((item) => (
              <li key={item.month} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm">
                <span className="text-slate-600">{formatMonth(item.month)}</span>
                <Bar percent={(item.totalKop / maxMonth) * 100} className="bg-emerald-600" />
                <span className="tabular-nums text-slate-900">{formatRub(item.totalKop)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface MetricProps {
  label: string;
  value: string;
  hint?: string;
}

function Metric({ label, value, hint }: MetricProps) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900 sm:text-base">{value}</dd>
      {hint !== undefined && <dd className="truncate text-xs text-slate-500">{hint}</dd>}
    </div>
  );
}

interface BarProps {
  percent: number;
  className: string;
  label?: string;
}

/** Горизонтальная полоска. Ширина — через проценты в классах-ступенях: inline-стили запрещены правилом 17. */
function Bar({ percent, className, label }: BarProps) {
  return (
    <div
      className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100"
      role={label === undefined ? undefined : 'img'}
      aria-label={label}
    >
      <div className={`h-full rounded-full ${className} ${widthClass(percent)}`} />
    </div>
  );
}

const WIDTHS = [
  'w-0',
  'w-[5%]',
  'w-[10%]',
  'w-[15%]',
  'w-[20%]',
  'w-[25%]',
  'w-[30%]',
  'w-[35%]',
  'w-[40%]',
  'w-[45%]',
  'w-[50%]',
  'w-[55%]',
  'w-[60%]',
  'w-[65%]',
  'w-[70%]',
  'w-[75%]',
  'w-[80%]',
  'w-[85%]',
  'w-[90%]',
  'w-[95%]',
  'w-full',
] as const;

/** Ширина полоски с шагом 5%: ненулевое значение видно всегда (минимум 5%). */
function widthClass(percent: number): string {
  if (percent <= 0) {
    return WIDTHS[0];
  }
  const step = Math.min(20, Math.max(1, Math.round(percent / 5)));
  return WIDTHS[step] ?? 'w-full';
}
