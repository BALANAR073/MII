import { useId, useState, type FormEvent } from 'react';
import { updateGroup } from '../../api';
import { useMutation } from '../../app/useMutation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import type { Group, MemberId } from '../../types/group';
import { EmojiPicker } from './EmojiPicker';

interface GroupSettingsDialogProps {
  group: Group;
  currentUserId: MemberId;
  onClose: () => void;
  onSaved: () => void;
  /** «Выйти из группы» — открывает подтверждение на экране группы. */
  onLeave: () => void;
}

const MAX_NAME_LENGTH = 50;

/**
 * Настройки группы (ДЗ6): название и эмодзи меняет владелец, остальные видят, кто владелец.
 * Здесь же — выход из группы, чтобы опасное действие не стояло в ряду обычных кнопок шапки.
 */
export function GroupSettingsDialog({ group, currentUserId, onClose, onSaved, onLeave }: GroupSettingsDialogProps) {
  const isOwner = group.ownerId === currentUserId;
  const [name, setName] = useState(group.name);
  const [emoji, setEmoji] = useState(group.emoji);
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useMutation();
  const { showToast } = useToast();
  const inputId = useId();
  const owner = group.members.find((member) => member.id === group.ownerId);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) {
      setError(trimmed.length === 0 ? 'Введите название' : 'Название — не длиннее 50 символов');
      return;
    }
    setError(null);
    try {
      const done = await run(async () => {
        await updateGroup(group.id, { name: trimmed, emoji });
        return true;
      });
      if (done === true) {
        showToast({ message: 'Группа обновлена', tone: 'success' });
        onSaved();
        onClose();
      }
    } catch (caught) {
      showToast({ message: apiErrorMessage(caught, 'save'), tone: 'error' });
    }
  };

  return (
    <Dialog title="Настройки группы" onClose={onClose}>
      {isOwner ? (
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-5">
          <div>
            <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-800">
              Название
            </label>
            <input
              id={inputId}
              className="block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-700"
              value={name}
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
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <div className="flex justify-end">
            <Button type="submit" pending={pending}>
              Сохранить
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-slate-600">Название и эмодзи меняет владелец группы{owner === undefined ? '' : ` — ${owner.name}`}.</p>
      )}
      <div className="mt-6 border-t border-slate-200 pt-4">
        <p className="mb-2 text-sm text-slate-600">Выйти можно, когда вы в расчёте. Вернуться — по ссылке-приглашению.</p>
        <Button
          variant="danger"
          onClick={() => {
            onClose();
            onLeave();
          }}
        >
          Выйти из группы
        </Button>
      </div>
    </Dialog>
  );
}
