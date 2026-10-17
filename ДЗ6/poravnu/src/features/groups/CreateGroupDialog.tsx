import { trackGoal } from '../../lib/metrika';
import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '../../app/useMutation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { cx } from '../../lib/cx';
import { addMember, createGroup } from '../../api';
import { GROUP_EMOJIS } from '../../mocks/seed';
import type { Group } from '../../types/group';
import { EmojiPicker } from './EmojiPicker';

interface CreateGroupDialogProps {
  onClose: () => void;
  onCreated: (group: Group) => void;
}

const MAX_NAME_LENGTH = 50;
const MAX_MEMBER_NAME = 40;

/**
 * Имена участников из строки «Аня, Боря; Вика»: без пустых и повторов, длиннее 40 символов обрезаются.
 * @param value Ввод пользователя.
 */
export function parseMemberNames(value: string): string[] {
  const names = value
    .split(/[,;\n]/)
    .map((item) => item.trim().slice(0, MAX_MEMBER_NAME))
    .filter((item) => item.length > 0);
  return [...new Set(names)];
}

/**
 * Создание группы: название 1–50 символов, эмодзи из 8 вариантов (FR-2.2, AC-02.1, AC-02.2)
 * и, с ДЗ6, участники по имени — сразу при создании.
 */
export function CreateGroupDialog({ onClose, onCreated }: CreateGroupDialogProps) {
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(GROUP_EMOJIS[0]);
  const [members, setMembers] = useState('');
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
      const names = parseMemberNames(members);
      const group = await run(async () => {
        const created = await createGroup({ name, emoji });
        // Участники по имени — сразу после группы (ДЗ6): новый пользователь не остаётся в группе один.
        for (const memberName of names) {
          await addMember(created.id, memberName);
        }
        return created;
      });
      if (group !== undefined) {
        trackGoal('group_created');
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
        <EmojiPicker value={emoji} onChange={setEmoji} />
        <div>
          <label htmlFor={`${inputId}-members`} className="mb-1 block text-sm font-medium text-slate-800">
            Участники <span className="font-normal text-slate-500">— необязательно</span>
          </label>
          <input
            id={`${inputId}-members`}
            value={members}
            placeholder="Аня, Боря, Вика"
            autoComplete="off"
            aria-describedby={`${inputId}-members-hint`}
            className="block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-700"
            onChange={(event) => setMembers(event.target.value)}
          />
          <p id={`${inputId}-members-hint`} className="mt-1 text-xs text-slate-500">
            Имена через запятую. Аккаунт им не нужен — позже каждый займёт своё место по ссылке-приглашению.
          </p>
        </div>
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
