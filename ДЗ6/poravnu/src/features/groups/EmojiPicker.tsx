import { handleRovingKeyDown } from '../../components/ui/roving';
import { FOCUS_RING } from '../../components/ui/styles';
import { cx } from '../../lib/cx';
import { GROUP_EMOJIS } from '../../mocks/seed';

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
}

/** Эмодзи группы из 8 вариантов (решение Q10): радиогруппа со стрелками. Общая для создания и настроек группы. */
export function EmojiPicker({ value, onChange }: EmojiPickerProps) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-800">Эмодзи</legend>
      <div role="radiogroup" aria-label="Эмодзи группы" className="grid grid-cols-8 gap-1">
        {GROUP_EMOJIS.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={value === item}
            tabIndex={value === item ? 0 : -1}
            aria-label={`Эмодзи ${item}`}
            className={cx(
              'flex aspect-square items-center justify-center rounded-xl text-xl',
              FOCUS_RING,
              value === item ? 'bg-emerald-100 ring-2 ring-emerald-700' : 'bg-slate-100 hover:bg-slate-200',
            )}
            onClick={() => onChange(item)}
            onKeyDown={(event) => handleRovingKeyDown(event, GROUP_EMOJIS, value, onChange)}
          >
            {item}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
