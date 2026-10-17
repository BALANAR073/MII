import { type ReactNode, useEffect, useId, useLayoutEffect, useRef } from 'react';
import { cx } from '../../lib/cx';
import { FOCUS_RING } from './styles';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** На мобильном — во весь экран (форма расхода), иначе — карточка по центру. */
  fullScreenOnMobile?: boolean;
  footer?: ReactNode;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Модальное окно: закрывается по Esc и кнопке, держит фокус внутри и возвращает его после закрытия (NFR-2).
 */
export function Dialog({ title, onClose, children, fullScreenOnMobile = false, footer }: DialogProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  // Свежий обработчик без перезапуска эффектов; запись в ref — не во время рендера (react-hooks/refs).
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    // Фокус — в первое поле; если полей нет, на само окно, чтобы не рисовать рамку на крестике.
    const first = panel?.querySelector<HTMLElement>('input, select, textarea') ?? panel;
    first?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === 'Tab' && panel !== null) {
        trapFocus(event, panel);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // Фон под модальным окном не должен прокручиваться.
    document.body.classList.add('overflow-hidden');
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.classList.remove('overflow-hidden');
      // Если элемент, с которого открыли окно, уже исчез (расход удалён, режим окна сменился),
      // ставим фокус на основное содержимое, а не теряем его на body (находка 8 AI-ревью).
      if (previouslyFocused?.isConnected === true) {
        previouslyFocused.focus();
      } else {
        document.getElementById('main')?.focus();
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative flex outline-none w-full flex-col bg-white shadow-xl sm:max-w-lg sm:rounded-xl',
          fullScreenOnMobile ? 'h-full sm:h-auto sm:max-h-[90vh]' : 'max-h-[90vh] rounded-t-xl',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className={cx(
              'flex h-11 w-11 items-center justify-center rounded-xl text-2xl leading-none text-slate-500 hover:bg-slate-100',
              FOCUS_RING,
            )}
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer !== undefined && <div className="border-t border-slate-200 px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}

function trapFocus(event: KeyboardEvent, panel: HTMLElement): void {
  const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (first === undefined || last === undefined) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}
