import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useMutation } from '../../app/useMutation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { apiErrorMessage } from '../../lib/apiErrorMessage';

interface DeleteAccountDialogProps {
  onClose: () => void;
}

const CONFIRM_WORD = 'удалить';

/**
 * Подтверждение удаления аккаунта (ДЗ6, миграция 7). Действие необратимо, поэтому нужно ввести слово «удалить».
 */
export function DeleteAccountDialog({ onClose }: DeleteAccountDialogProps) {
  const { deleteAccount } = useAuth();
  const navigate = useNavigate();
  const remove = useMutation();
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const confirmed = word.trim().toLowerCase() === CONFIRM_WORD;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!confirmed) {
      return;
    }
    setError(null);
    try {
      await remove.run(() => deleteAccount());
      navigate('/login', { replace: true });
    } catch (caught) {
      setError(apiErrorMessage(caught, 'save'));
    }
  };

  return (
    <Dialog title="Удалить аккаунт?" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Профиль и вход удаляются навсегда.</li>
          <li>Группы, где кроме вас никого нет, удаляются вместе с расходами.</li>
          <li>В остальных группах ваши расходы останутся, чтобы не сломать чужие балансы, — под вашим именем, но без аккаунта.</li>
        </ul>
        <div>
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-800">
            Чтобы подтвердить, введите «{CONFIRM_WORD}»
          </label>
          <input
            id={inputId}
            autoComplete="off"
            className="block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base focus:outline-none focus:ring-2 focus:ring-rose-600"
            value={word}
            onChange={(event) => setWord(event.target.value)}
          />
        </div>
        {error !== null && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" variant="danger" disabled={!confirmed} pending={remove.pending}>
            Удалить навсегда
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
