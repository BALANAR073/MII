import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '../../app/useMutation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { cx } from '../../lib/cx';
import { createGroup } from '../../mocks/mockApi';
import { GROUP_EMOJIS } from '../../mocks/seed';
import type { Group } from '../../types/group';
import { FOCUS_RING } from '../../components/ui/styles';

interface CreateGroupDialogProps {
  onClose: () => void;
  onCreated: (group: Group) => void;
}

const MAX_NAME_LENGTH = 50;

/** Создание группы: название 1–50 символов и эмодзи из 8 вариантов (FR-2.2, AC-02.1, AC-02.2). */
export function CreateGroupDialog({ onClose, onCreated }: CreateGroupDialogProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(GROUP_EMOJIS[0]);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useMutation();
  const { showToast } = useToast();
  const inputId = useId();

  const validate = (value: string) => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return 'Введите название';
    }
    return trimmed.length > MAX_NAME_LENGTH ? 'Название — не длиннее 50 символов' : null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const message = validate(name);
    setError(message);
    if (message !== null) {
      document.getElementById(inputId)?.focus();
      return;
    }
    try {
      const group = await run(() => createGroup({ name, emoji }));
      if (group !== undefined) {
        showToast({ message: `Группа «${group.name}» создана`, tone: 'success' });
        onCreated(group);
      }
    } catch (caught) {
      showToast({ message: apiErrorMessage(caught, 'save'), tone: 'error' });
    }
  };

  return (
    <Dialog title="Новая группа" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
        <div>
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-800">
            Название
          </label>
          <input
            id={inputId}
            value={name}
            placeholder="Например, Поездка в Казань"
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : `${inputId}-error`}
            className={cx(
              'block min-h-11 w-full rounded-xl border px-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-700',
              error === null ? 'border-slate-300' : 'border-rose-500',
            )}
            onChange={(event) => {
              setName(event.target.value);
              if (error !== null) {
                setError(validate(event.target.value));
              }
            }}
            onBlur={() => setError(validate(name))}
          />
          {error !== null && (
            <p id={`${inputId}-error`} className="mt-1 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-800">Эмодзи</legend>
          <div role="radiogroup" aria-label="Эмодзи группы" className="grid grid-cols-8 gap-1">
            {GROUP_EMOJIS.map((item) => (
              <button
                key={item}
                type="button"
                role="radio"
                aria-checked={emoji === item}
                aria-label={`Эмодзи ${item}`}
                className={cx(
                  'flex aspect-square items-center justify-center rounded-xl text-xl', FOCUS_RING,
                  emoji === item ? 'bg-emerald-100 ring-2 ring-emerald-700' : 'bg-slate-100 hover:bg-slate-200',
                )}
                onClick={() => setEmoji(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" pending={pending}>
            Создать
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
