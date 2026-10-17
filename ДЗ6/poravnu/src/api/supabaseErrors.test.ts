import { describe, expect, it } from 'vitest';
import { fromAuthError, fromPostgrestError } from './supabaseErrors';
import { parseSplit } from './supabaseApi';

describe('fromPostgrestError — ответы PostgREST в ошибки приложения', () => {
  it.each([
    ['запрос не дошёл до сервера', { message: 'TypeError: Failed to fetch' }, 0, 'network'],
    ['RLS: нет прав', { code: '42501', message: 'new row violates row-level security policy for table "expenses"' }, 403, 'forbidden'],
    ['CHECK-ограничение', { code: '23514', message: 'invalid_weight', hint: 'Доля — целое число от 1 до 1000' }, 400, 'validation'],
    ['истёкший JWT', { code: 'PGRST301', message: 'JWT expired' }, 401, 'unauthorized'],
    ['RPC без входа', { code: 'PT401', message: 'not_authenticated', hint: 'Сессия истекла, войдите снова' }, 401, 'unauthorized'],
    ['неверное приглашение', { code: 'PT404', message: 'invalid_invite', hint: '…' }, 404, 'invalid-invite'],
    ['группа заполнена', { code: 'PT409', message: 'group_full' }, 409, 'group-full'],
    ['ошибка сервера', { message: 'upstream timeout' }, 503, 'server'],
  ])('%s → %s', (_label, error, status, kind) => {
    expect(fromPostgrestError(error, status).kind).toBe(kind);
  });

  it('выход с долгом: сумма из details попадает в ошибку (AC-11.2)', () => {
    const error = fromPostgrestError({ code: 'PT409', message: 'balance_not_zero', details: '-94075', hint: 'Сначала рассчитайтесь' }, 409);
    expect(error.kind).toBe('balance-not-zero');
    expect(error.amountKop).toBe(-94_075);
  });

  it('текст для пользователя берётся из hint, а не из технического message', () => {
    expect(fromPostgrestError({ code: '23514', message: 'empty_split', hint: 'Выберите хотя бы одного участника' }, 400).message).toBe(
      'Выберите хотя бы одного участника',
    );
  });
});

describe('fromAuthError — ответы Supabase Auth', () => {
  it.each([
    [{ code: 'invalid_credentials', status: 400 }, 'auth-invalid-credentials'],
    [{ code: 'user_already_exists', status: 422 }, 'auth-email-taken'],
    [{ code: 'weak_password', status: 422 }, 'validation'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'network'],
    [{ code: 'over_request_rate_limit', status: 429 }, 'validation'],
  ])('%j → %s', (error, kind) => {
    expect(fromAuthError(error).kind).toBe(kind);
  });
});

describe('parseSplit — split из jsonb', () => {
  it('принимает оба способа деления', () => {
    expect(parseSplit({ kind: 'equal', memberIds: ['a', 'b'] })).toEqual({ kind: 'equal', memberIds: ['a', 'b'] });
    expect(parseSplit({ kind: 'shares', shares: [{ memberId: 'a', weight: 2 }] })).toEqual({
      kind: 'shares',
      shares: [{ memberId: 'a', weight: 2 }],
    });
  });

  it('не доверяет неожиданному формату', () => {
    expect(() => parseSplit({ kind: 'shares', shares: [{ memberId: 'a' }] })).toThrow('Неожиданный формат');
    expect(() => parseSplit('equal')).toThrow('Неожиданный формат');
  });
});
