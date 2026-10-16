import { useId, useState, type FormEvent } from 'react';
import { useMutation } from '../../app/useMutation';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../components/ui/Toast';
import { apiErrorMessage } from '../../lib/apiErrorMessage';
import { formatRub, kopToInput, parseRubToKop } from '../../lib/money';
import { addTransfer } from '../../api';
import type { Member } from '../../types/group';
import type { SuggestedTransfer } from '../balances/types';
import { memberName } from '../expenses/describeExpense';

interface TransferDialogProps {
  groupId: string;
  transfer: SuggestedTransfer;
  members: readonly Member[];
  onClose: () => void;
  onDone: () => void;
}

/**
 * Отметка перевода (FR-5.1). Сумму можно уменьшить — частичный перевод (решение Q2).
 * Балансы меняются только после ответа сервера; при ошибке окно не закрывается (ERR-4, AC-08.3).
 */
export function TransferDialog({ groupId, transfer, members, onClose, onDone }: TransferDialogProps) {
  const [amount, setAmount] = useState(kopToInput(transfer.amountKop));
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useMutation();
  const { showToast } = useToast();
  const inputId = useId();
  const fromName = memberName(members, transfer.fromId);
  const toName = memberName(members, transfer.toId);

  const submit = async () => {
    const parsed = parseRubToKop(amount);
    if (!parsed.ok || parsed.amountKop > transfer.amountKop) {
      setError(`Введите сумму от 0,01 до ${formatRub(transfer.amountKop)}`);
      return;
    }
    setError(null);
    try {
      const saved = await run(() => addTransfer(groupId, { fromId: transfer.fromId, toId: transfer.toId, amountKop: parsed.amountKop }));
      if (saved !== undefined) {
        showToast({ message: `Перевод ${formatRub(saved.amountKop)} отмечен`, tone: 'success' });
        onDone();
      }
    } catch (caught) {
      showToast({ message: apiErrorMessage(caught, 'save'), tone: 'error', action: { label: 'Повторить', onClick: () => void submit() } });
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };

  return (
    <Dialog title="Отметить перевод" onClose={onClose}>
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <p className="text-base text-slate-800">
          <span className="font-semibold">{fromName}</span> → <span className="font-semibold">{toName}</span>
        </p>
        <p className="text-sm text-slate-600">
          Отметьте перевод, когда деньги уже отправлены через СБП или наличными. Можно указать часть суммы.
        </p>
        <div>
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-slate-800">
            Сумма, ₽
          </label>
          <input
            id={inputId}
            className="block min-h-11 w-full rounded-xl border border-slate-300 px-3 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-700"
            inputMode="decimal"
            value={amount}
            aria-invalid={error !== null}
            aria-describedby={error === null ? undefined : `${inputId}-error`}
            onChange={(event) => setAmount(event.target.value)}
          />
          {error !== null && (
            <p id={`${inputId}-error`} className="mt-1 text-sm text-rose-700">
              {error}
            </p>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button type="submit" pending={pending}>
            Подтвердить перевод
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
