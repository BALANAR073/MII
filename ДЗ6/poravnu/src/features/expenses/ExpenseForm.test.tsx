import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../test/renderApp';
import type { Member } from '../../types/group';
import { ExpenseForm } from './ExpenseForm';
import { emptyExpenseForm } from './expenseFormModel';

const MEMBERS: Member[] = [
  { id: 'anya', name: 'Аня', joinedAt: '2026-10-09T18:00:00.000Z', leftAt: null },
  { id: 'borya', name: 'Боря', joinedAt: '2026-10-09T18:05:00.000Z', leftAt: null },
  { id: 'gosha', name: 'Гоша', joinedAt: '2026-10-09T18:20:00.000Z', leftAt: null },
];

function renderForm() {
  const onSubmit = vi.fn();
  const view = renderWithProviders(
    <ExpenseForm
      initialValues={emptyExpenseForm(MEMBERS, 'borya', '2026-10-16')}
      activeMembers={MEMBERS}
      submitLabel="Сохранить"
      onSubmit={onSubmit}
      onCancel={vi.fn()}
    />,
  );
  return { onSubmit, ...view };
}

describe('ExpenseForm', () => {
  it('отправляет расход «Хостел 12000» на всех (AC-04.1)', async () => {
    const { user, onSubmit } = renderForm();
    await user.type(screen.getByLabelText('Название'), 'Хостел');
    await user.type(screen.getByLabelText('Сумма, ₽'), '12000');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Хостел',
      amountKop: 1_200_000,
      payerId: 'borya',
      split: { kind: 'equal', memberIds: ['anya', 'borya', 'gosha'] },
      date: '2026-10-16',
      category: 'housing', // подобрана по названию «Хостел» (ДЗ6)
    });
  });

  it('не отправляет пустую форму, показывает ошибки и ставит фокус на первое поле (ERR-1)', async () => {
    const { user, onSubmit } = renderForm();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Введите название')).toBeInTheDocument();
    expect(screen.getByText('Введите сумму больше 0, до копеек')).toBeInTheDocument();
    expect(screen.getByLabelText('Название')).toHaveFocus();
    expect(screen.getByLabelText('Название')).toHaveAttribute('aria-invalid', 'true');
  });

  it('требует хотя бы одного участника деления (AC-04.4)', async () => {
    const { user, onSubmit } = renderForm();
    await user.type(screen.getByLabelText('Название'), 'Такси');
    await user.type(screen.getByLabelText('Сумма, ₽'), '999,99');
    for (const name of ['Аня', 'Боря', 'Гоша']) {
      await user.click(screen.getByRole('checkbox', { name }));
    }
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Выберите хотя бы одного участника')).toBeInTheDocument();
  });

  it('делит по долям и проверяет дробную долю (AC-05.1, AC-05.3)', async () => {
    const { user, onSubmit } = renderForm();
    await user.type(screen.getByLabelText('Название'), 'Кофе');
    await user.type(screen.getByLabelText('Сумма, ₽'), '600');
    await user.click(screen.getByRole('checkbox', { name: 'Аня' }));
    await user.click(screen.getByRole('radio', { name: 'По долям' }));
    const goshaWeight = screen.getByLabelText('Доля: Гоша');
    await user.clear(goshaWeight);
    await user.type(goshaWeight, '1,5');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByText('Доля — целое число от 1 до 1000')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    await user.clear(goshaWeight);
    await user.type(goshaWeight, '2');
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        amountKop: 60_000,
        split: {
          kind: 'shares',
          shares: [
            { memberId: 'borya', weight: 1 },
            { memberId: 'gosha', weight: 2 },
          ],
        },
      }),
    );
  });
});
