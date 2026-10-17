import { describe, expect, it } from 'vitest';
import { demoAccounts } from './demoAccounts';

describe('демо-аккаунты (ДЗ6)', () => {
  it('на сайте — аккаунты Supabase', () => {
    const [borya] = demoAccounts(true);
    expect(borya).toMatchObject({ name: 'Боря', email: 'borya.poravnu.demo@example.com', password: 'Demo-pass-2026' });
  });

  it('без сервера — аккаунты mock-API; пароли не короче 8 символов, как требует форма', () => {
    const accounts = demoAccounts(false);
    expect(accounts.map((account) => account.email)).toEqual([
      'borya@poravnu.demo',
      'anya@poravnu.demo',
      'vika@poravnu.demo',
      'gosha@poravnu.demo',
    ]);
    expect(accounts.every((account) => account.password.length >= 8)).toBe(true);
  });
});
