import { useCallback, useId, useState } from 'react';
import { getInviteLink, rotateInvite } from '../../api';
import { useMutation } from '../../app/useMutation';
import { useResource } from '../../app/useResource';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import type { Group, MemberId } from '../../types/group';

interface InviteDialogProps {
  group: Group;
  currentUserId: MemberId;
  onClose: () => void;
}

/**
 * Приглашение в группу (FR-2.3, ДЗ6): ссылка на виду, «Скопировать», «Поделиться» (меню телефона)
 * и для владельца — «Сбросить ссылку», если она ушла не тем людям (FR-2.5, рекомендация Р-11 аудита).
 */
export function InviteDialog({ group, currentUserId, onClose }: InviteDialogProps) {
  const loader = useCallback(() => getInviteLink(group.id), [group.id]);
  const { state, reload } = useResource(`invite:${group.id}`, loader);
  const [rotated, setRotated] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const rotate = useMutation();
  const { showToast } = useToast();
  const inputId = useId();
  const link = rotated ?? (state.status === 'success' ? state.data : null);
  const isOwner = group.ownerId === currentUserId;
  const places = group.members.filter((member) => member.isVirtual === true && member.leftAt === null);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    if (link === null) return;
    try {
      await navigator.clipboard.writeText(link);
      showToast({ message: 'Ссылка скопирована — отправьте её друзьям', tone: 'success' });
    } catch {
      document.getElementById(inputId)?.focus();
      showToast({ message: 'Скопируйте ссылку из поля вручную' });
    }
  };

  const share = async () => {
    if (link === null) return;
    try {
      await navigator.share({ title: `ПоРовну: ${group.name}`, text: `Присоединяйся к группе «${group.name}» в ПоРовну`, url: link });
    } catch {
      // Пользователь закрыл меню «Поделиться» — это не ошибка.
    }
  };

  const doRotate = async () => {
    try {
      const next = await rotate.run(() => rotateInvite(group.id));
      if (next !== undefined) {
        setRotated(next);
        setConfirmRotate(false);
        showToast({ message: 'Новая ссылка готова, старая больше не работает', tone: 'success' });
      }
    } catch (caught) {
      showToast({ message: apiErrorMessage(caught, 'save'), tone: 'error' });
    }
  };

  return (
    <Dialog title="Пригласить в группу" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Отправьте ссылку участникам. Открыв её, человек войдёт или зарегистрируется и попадёт в «{group.name}».
        </p>
        {places.length > 0 && (
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-sm text-sky-900">
            Ждут своих хозяев: <span className="font-medium">{places.map((member) => member.name).join(', ')}</span>. По ссылке человек
            сможет выбрать «Это я» и забрать все свои расходы.
          </p>
        )}
        <div>
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-800">
            Ссылка-приглашение
          </label>
          {link === null ? (
            state.status === 'error' ? (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800">
                {apiErrorMessage(state.error, 'load')}
                <Button variant="ghost" onClick={reload}>
                  Повторить
                </Button>
              </div>
            ) : (
              <Skeleton className="h-11 w-full" />
            )
          ) : (
            <input
              id={inputId}
              readOnly
              value={link}
              className="block min-h-11 w-full rounded-xl border border-slate-300 bg-slate-50 px-3 font-mono text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-700"
              onFocus={(event) => event.target.select()}
            />
          )}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button className="flex-1" disabled={link === null} onClick={() => void copy()}>
            Скопировать
          </Button>
          {canShare && (
            <Button variant="secondary" className="flex-1" disabled={link === null} onClick={() => void share()}>
              Поделиться…
            </Button>
          )}
        </div>
        {isOwner && (
          <div className="border-t border-slate-200 pt-4">
            {confirmRotate ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">
                  Старая ссылка перестанет работать. Тем, кто ещё не вступил, нужно будет отправить новую.
                </p>
                <div className="flex gap-2">
                  <Button variant="danger" pending={rotate.pending} onClick={() => void doRotate()}>
                    Сбросить ссылку
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmRotate(false)}>
                    Отмена
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmRotate(true)}>
                Сбросить ссылку…
              </Button>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
