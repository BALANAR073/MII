import { useId, useRef, useState, type FormEvent } from 'react';
import { addMember } from '../../api';
import { useMutation } from '../../app/useMutation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';

interface AddMemberDialogProps {
  groupId: string;
  onClose: () => void;
  /** Вызывается после каждого добавленного участника — экран группы перезагружает данные. */
  onAdded: () => void;
}

const MAX_NAME_LENGTH = 40;

/**
 * Добавление участника по имени, без аккаунта (ДЗ6, миграция 6). После добавления поле очищается —
 * можно сразу вписать следующего. Позже человек займёт своё место по ссылке-приглашению.
 */
export function AddMemberDialog({ groupId, onClose, onAdded }: AddMemberDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const { pending, run } = useMutation();
  const { showToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      setError(`Имя — от 1 до ${MAX_NAME_LENGTH} символов`);
      inputRef.current?.focus();
      return;
    }
    setError(null);
    try {
      const member = await run(() => addMember(groupId, trimmed));
      if (member !== undefined) {
        setAdded((current) => [...current, member.name]);
        setName('');
        onAdded();
        inputRef.current?.focus();
      }
    } catch (caught) {
      showToast({ message: apiErrorMessage(caught, 'save'), tone: 'error' });
    }
  };

  return (
    <Dialog title="Добавить участника" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <p className="text-sm text-slate-600">
          Впишите имя — человек сразу появится в группе, на него можно делить расходы. Аккаунт не нужен: позже он откроет ссылку-приглашение
          и выберет «Это я».
        </p>
        <div>
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-800">
            Имя
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className="block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-700"
            value={name}
            maxLength={60}
            placeholder="Например, Аня"
            autoComplete="off"
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : `${inputId}-error`}
            onChange={(event) => setName(event.target.value)}
          />
          {error !== null && (
            <p id={`${inputId}-error`} className="mt-1 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
        {added.length > 0 && (
          <p role="status" className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            Добавлены: {added.join(', ')}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            {added.length > 0 ? 'Готово' : 'Отмена'}
          </Button>
          <Button type="submit" pending={pending}>
            Добавить
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
