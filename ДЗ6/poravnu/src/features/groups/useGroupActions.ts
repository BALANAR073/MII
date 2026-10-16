import { useNavigate } from 'react-router-dom';
import { useMutation } from '../../app/useMutation';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { getInviteLink, leaveGroup } from '../../api';
import type { Group } from '../../types/group';

/**
 * Действия из шапки группы: пригласить по ссылке (FR-2.3) и выйти из группы (FR-2.4).
 * Вынесено из GroupPage при рефакторинге.
 * @param group Группа.
 * @returns Обработчики и флаги ожидания.
 */
export function useGroupActions(group: Group) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const invite = useMutation();
  const leave = useMutation();

  const inviteFriends = async () => {
    try {
      const link = await invite.run(() => getInviteLink(group.id));
      if (link === undefined) {
        return;
      }
      try {
        await navigator.clipboard.writeText(link);
        showToast({ message: 'Ссылка скопирована — отправьте её друзьям', tone: 'success' });
      } catch {
        // Буфер обмена недоступен (нет разрешения или http) — показываем ссылку, чтобы её скопировали вручную.
        showToast({ message: `Ссылка-приглашение: ${link}`, durationMs: 10_000 });
      }
    } catch (error) {
      showToast({ message: apiErrorMessage(error, 'save'), tone: 'error' });
    }
  };

  /** @returns `true`, если выход выполнен; при ошибке (например, есть долг) показывает тост. */
  const leaveCurrentGroup = async (): Promise<boolean> => {
    try {
      const done = await leave.run(async () => {
        await leaveGroup(group.id);
        return true;
      });
      if (done === true) {
        showToast({ message: `Вы вышли из группы «${group.name}»`, tone: 'success' });
        navigate('/');
        return true;
      }
    } catch (error) {
      showToast({ message: apiErrorMessage(error, 'save'), tone: 'error' });
    }
    return false;
  };

  return { inviteFriends, inviting: invite.pending, leaveCurrentGroup, leaving: leave.pending };
}
