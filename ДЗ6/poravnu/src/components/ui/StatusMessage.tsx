import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

interface StatusMessageProps {
  tone: 'error' | 'empty';
  title: string;
  description?: string;
  /** Кнопка действия: «Повторить», «Добавить расход» и т. п. */
  action?: ReactNode;
  icon?: string;
}

/** Состояния error и empty (ERR-2, ERR-3, NFR-9): пояснение и действие, а не пустой экран. */
export function StatusMessage({ tone, title, description, action, icon }: StatusMessageProps) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex flex-col items-center rounded-xl px-6 py-10 text-center', tone === 'error' ? 'bg-rose-50' : 'bg-white')}
    >
      {icon !== undefined && (
        <span aria-hidden="true" className="mb-3 text-4xl">
          {icon}
        </span>
      )}
      <p className={cx('text-base font-semibold', tone === 'error' ? 'text-rose-800' : 'text-slate-800')}>{title}</p>
      {description !== undefined && <p className="mt-1 max-w-sm text-sm text-slate-600">{description}</p>}
      {action !== undefined && <div className="mt-5">{action}</div>}
    </div>
  );
}
