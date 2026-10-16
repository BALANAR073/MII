import { ApiError } from '../types/api';
import { formatRub } from './money';

export type ErrorContext = 'load' | 'save' | 'delete';

const NETWORK_MESSAGES: Record<ErrorContext, string> = {
  load: 'Не удалось загрузить данные. Проверьте интернет',
  save: 'Не удалось сохранить. Проверьте интернет',
  delete: 'Не удалось удалить. Проверьте интернет',
};

/**
 * Переводит ошибку API в текст для пользователя по разделу 6 ТЗ.
 * Технические детали в интерфейс не попадают (ERR-5).
 * @param error Пойманная ошибка любого типа.
 * @param context Загрузка, сохранение или удаление — от этого зависит текст сетевой ошибки.
 * @returns Сообщение на русском.
 */
export function apiErrorMessage(error: unknown, context: ErrorContext): string {
  if (!(error instanceof ApiError)) {
    return 'Что-то пошло не так. Мы уже разбираемся';
  }
  switch (error.kind) {
    case 'network':
      return NETWORK_MESSAGES[context];
    case 'unauthorized':
      return 'Сессия истекла, войдите снова';
    case 'forbidden':
      return error.message;
    case 'not-found':
      return 'Группа недоступна — возможно, вы вышли из неё или ссылка устарела';
    case 'conflict':
      return error.message;
    case 'validation':
      return error.message;
    case 'balance-not-zero':
      return describeLeaveBlock(error.amountKop ?? 0);
    case 'server':
      return 'Что-то пошло не так. Мы уже разбираемся';
  }
}

function describeLeaveBlock(balanceKop: number): string {
  return balanceKop < 0
    ? `Сначала рассчитайтесь: вы должны ${formatRub(-balanceKop)}`
    : `Сначала рассчитайтесь: вам должны ${formatRub(balanceKop)}`;
}
