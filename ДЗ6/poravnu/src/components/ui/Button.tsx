import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { Spinner } from './Spinner';
import { FOCUS_RING } from './styles';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Идёт запрос: показываем индикатор и блокируем повторное нажатие (ERR-11). */
  pending?: boolean;
  children: ReactNode;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-emerald-700 text-white hover:bg-emerald-800 disabled:bg-emerald-700/60',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'border border-rose-200 bg-white text-rose-700 hover:bg-rose-50',
};

/** Кнопка с вариантами оформления и состоянием ожидания. */
export function Button({
  variant = 'primary',
  pending = false,
  className,
  children,
  disabled,
  type = 'button',
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      // В ожидании — aria-disabled, а не disabled: нативный disabled снимает фокус с нажатой кнопки (находка 14).
      disabled={disabled}
      aria-disabled={pending || undefined}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (pending) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition',
        FOCUS_RING,
        'disabled:cursor-not-allowed aria-disabled:cursor-progress aria-disabled:opacity-80',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...rest}
    >
      {pending && <Spinner />}
      {children}
    </button>
  );
}
