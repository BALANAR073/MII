import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Открыть
      </button>
      {open && (
        <Dialog title="Окно" onClose={() => setOpen(false)}>
          <input aria-label="Поле" />
          <button type="button">Действие</button>
        </Dialog>
      )}
    </>
  );
}

describe('Dialog (NFR-2)', () => {
  it('ставит фокус в первое поле, закрывается по Esc и возвращает фокус на кнопку открытия', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));

    expect(screen.getByRole('dialog', { name: 'Окно' })).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Поле')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть' })).toHaveFocus();
  });

  it('держит фокус внутри окна при Tab и Shift+Tab', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Открыть' }));

    // Порядок в окне: «Закрыть» → «Поле» → «Действие». С последнего элемента Tab идёт на первый, и наоборот.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Действие' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Действие' })).toHaveFocus();
  });

  it('закрывается крестиком', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Dialog title="Окно" onClose={onClose}>
        текст
      </Dialog>,
    );
    await user.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
