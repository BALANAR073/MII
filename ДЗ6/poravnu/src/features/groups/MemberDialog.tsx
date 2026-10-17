import { useId, useState, type FormEvent } from 'react';
import { removeMember, renameMember } from '../../api';
import { useMutation } from '../../app/useMutation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { formatRub } from '../../lib/money';
import type { Member } from '../../types/group';
import type { Kopecks } from '../../types/money';

interface MemberDialogProps {
  groupId: string;
  member: Member;
  balanceKop: Kopecks;
  onClose: () => void;
  onChanged: () => void;
}

/** Участник без аккаунта (ДЗ6): переименовать или убрать из группы — убрать можно только при нулевом балансе. */
export function MemberDialog({ groupId, member, balanceKop, onClose, onChanged }: MemberDialogProps) {
  const [name, setName] = useState(member.name);
  const rename = useMutation();
  const remove = useMutation();
  const { showToast } = useToast();
  const inputId = useId();

  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 40) {
      showToast({ message: 'Имя — от 1 до 40 символов', tone: 'error' });
      return;
    }
    try {
      const done = await rename.run(async () => {
        await renameMember(groupId, member.id, trimmed);
        return true;
      });
      if (done === true) {
        showToast({ message: 'Имя изменено', tone: 'success' });
        onChanged();
        onClose();
      }
    } catch (caught) {
      showToast({ message: apiErrorMessage(caught, 'save'), tone: 'error' });
    }
  };

  const handleRemove = async () => {
    try {
      const done = await remove.run(async () => {
        await removeMember(groupId, member.id);
        return true;
      });
      if (done === true) {
        showToast({ message: `${member.name} больше не в группе`, tone: 'success' });
        onChanged();
        onClose();
      }
    } catch (caught) {
      showToast({ message: apiErrorMessage(caught, 'save'), tone: 'error' });
    }
  };

  return (
    <Dialog title={member.name} onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleRename(event)} className="space-y-4">
        <p className="text-sm text-slate-600">
          Участник без аккаунта. Отправьте ему ссылку-приглашение — он войдёт, выберет «Это я» и увидит все свои расходы.
        </p>
        <div>
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-800">
            Имя
          </label>
          <input
            id={inputId}
            className="block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-emerald-700"
            value={name}
            maxLength={60}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="danger" pending={remove.pending} disabled={balanceKop !== 0} onClick={() => void handleRemove()}>
            Убрать из группы
          </Button>
          <Button type="submit" pending={rename.pending}>
            Сохранить имя
          </Button>
        </div>
        {balanceKop !== 0 && (
          <p className="text-xs text-slate-500">
            Убрать можно, когда участник в расчёте.{' '}
            {`Сейчас ${balanceKop > 0 ? 'ему должны' : 'у него долг'} ${formatRub(Math.abs(balanceKop))}.`}
          </p>
        )}
      </form>
    </Dialog>
  );
}
