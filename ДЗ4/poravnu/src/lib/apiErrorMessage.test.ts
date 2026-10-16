import { describe, expect, it } from 'vitest';
import { ApiError } from '../types/api';
import { apiErrorMessage } from './apiErrorMessage';

describe('apiErrorMessage (раздел 6 ТЗ)', () => {
  it('сетевая ошибка зависит от действия', () => {
    const error = new ApiError('network', 'Network request failed');
    expect(apiErrorMessage(error, 'load')).toBe('Не удалось загрузить данные. Проверьте интернет');
    expect(apiErrorMessage(error, 'save')).toBe('Не удалось сохранить. Проверьте интернет');
    expect(apiErrorMessage(error, 'delete')).toBe('Не удалось удалить. Проверьте интернет');
  });

  it('не показывает технические детали ошибки 500 и неизвестных ошибок (ERR-5)', () => {
    expect(apiErrorMessage(new ApiError('server', 'stack trace…'), 'load')).toBe('Что-то пошло не так. Мы уже разбираемся');
    expect(apiErrorMessage(new TypeError('x is undefined'), 'save')).toBe('Что-то пошло не так. Мы уже разбираемся');
  });

  it('при запрете выхода называет сумму долга (AC-11.2)', () => {
    expect(apiErrorMessage(new ApiError('balance-not-zero', '', -94_075), 'save')).toBe('Сначала рассчитайтесь: вы должны 940,75 ₽');
  });

  it('401 — сессия истекла (ERR-6)', () => {
    expect(apiErrorMessage(new ApiError('unauthorized', ''), 'load')).toBe('Сессия истекла, войдите снова');
  });
});
