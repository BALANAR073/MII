import { describe, expect, it } from 'vitest';
import { demoAccounts, isDemoEmail } from './demoAccounts';

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

describe('isDemoEmail', () => {
  it('узнаёт демо-аккаунты сайта и mock-API', () => {
    expect(isDemoEmail('Borya.poravnu.demo@example.com')).toBe(true);
    expect(isDemoEmail('anya@poravnu.demo')).toBe(true);
  });

  it('обычный и тестовый email — не демо', () => {
    expect(isDemoEmail('kola@gmail.com')).toBe(false);
    expect(isDemoEmail('e2e-abc-anya@example.com')).toBe(false);
  });
});
