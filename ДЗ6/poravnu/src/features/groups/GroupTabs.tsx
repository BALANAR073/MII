import { FOCUS_RING } from '../../components/ui/styles';
import { cx } from '../../lib/cx';
import { handleRovingKeyDown } from '../../components/ui/roving';

export type GroupTab = 'expenses' | 'balances' | 'stats';

interface GroupTabsProps {
  value: GroupTab;
  onChange: (tab: GroupTab) => void;
}

const LABELS: Record<GroupTab, string> = { expenses: 'Расходы', balances: 'Участники', stats: 'Статистика' };
const TABS: readonly GroupTab[] = ['expenses', 'balances', 'stats'];
/** На десктопе участники и балансы всегда видны справа — вкладка нужна только расходам и статистике. */
const DESKTOP_TABS: readonly GroupTab[] = ['expenses', 'stats'];

/**
 * Вкладки группы (концепция 1): «Расходы | Участники | Статистика» на телефоне и планшете;
 * на десктопе — «Расходы | Статистика», а участники с балансами видны в правой колонке (ДЗ6).
 */
export function GroupTabs({ value, onChange }: GroupTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Разделы группы"
      className="sticky top-14 z-10 flex border-b border-slate-200 bg-white px-4 sm:rounded-xl"
    >
      {TABS.map((tab) => (
        <button
          key={tab}
          id={`tab-${tab}`}
          type="button"
          role="tab"
          aria-selected={value === tab}
          tabIndex={value === tab ? 0 : -1}
          aria-controls={`panel-${tab}`}
          className={cx(
            'min-h-11 border-b-2 px-3 text-sm font-medium transition',
            !DESKTOP_TABS.includes(tab) && 'lg:hidden',
            FOCUS_RING,
            value === tab ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500',
          )}
          onClick={() => onChange(tab)}
          onKeyDown={(event) => handleRovingKeyDown(event, TABS, value, onChange)}
        >
          {LABELS[tab]}
        </button>
      ))}
    </div>
  );
}
