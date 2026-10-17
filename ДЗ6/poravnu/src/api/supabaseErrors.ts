import { ApiError } from '../types/api';

/**
 * Перевод ошибок Supabase (PostgREST и Auth) в ApiError, по которому UI выбирает текст из раздела 6 ТЗ.
 * Коды SQL-функций — из миграций: в message машинный ключ (`balance_not_zero`), в hint — текст для человека.
 */

export interface RawSupabaseError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
  status?: number;
  name?: string;
}

const VALIDATION_CODES = new Set(['23514', '23503', '23505', '23502', '22P02', '22003']);

/**
 * Ошибка PostgREST (таблицы и RPC) → ApiError.
 * @param error Объект `error` из ответа supabase-js.
 * @param status HTTP-статус ответа (0 — запрос не дошёл до сервера).
 * @returns Типизированная ошибка.
 */
export function fromPostgrestError(error: RawSupabaseError, status: number): ApiError {
  const message = error.message ?? '';
  const hint = error.hint ?? '';
  if (status === 0 || /failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return new ApiError('network', 'Network request failed');
  }
  switch (message) {
    case 'balance_not_zero':
      return new ApiError('balance-not-zero', hint, toNumber(error.details));
    case 'invalid_invite':
      return new ApiError('invalid-invite', hint || 'Приглашение недействительно. Попросите новую ссылку');
    case 'group_full':
      return new ApiError('group-full', hint || 'В группе уже 50 участников');
    case 'not_authenticated':
      return new ApiError('unauthorized', hint);
    case 'already_member':
      return new ApiError('already-member', hint || 'Вы уже состоите в этой группе');
    case 'not_virtual':
      return new ApiError('place-taken', hint || 'Это место уже занято');
    default:
      break;
  }
  if (status === 401 || error.code === 'PGRST301' || error.code === 'PGRST303') {
    return new ApiError('unauthorized', 'JWT expired or missing');
  }
  if (error.code === '42501' || status === 403) {
    return new ApiError('forbidden', hint || 'Нет доступа к группе');
  }
  if ((error.code !== undefined && VALIDATION_CODES.has(error.code)) || status === 400) {
    return new ApiError('validation', hint || 'Проверьте введённые данные');
  }
  if (status === 404) {
    return new ApiError('not-found', message);
  }
  if (status === 409) {
    return new ApiError('conflict', hint || message);
  }
  return new ApiError('server', message || `HTTP ${status}`);
}

/**
 * Ошибка Supabase Auth → ApiError (FR-1.1, FR-1.3).
 * @param error Объект ошибки из supabase.auth.*.
 * @returns Типизированная ошибка.
 */
export function fromAuthError(error: RawSupabaseError): ApiError {
  const code = error.code ?? '';
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return new ApiError('network', 'Network request failed');
  }
  if (code === 'invalid_credentials') {
    // Не уточняем, что именно неверно — email или пароль (FR-1.3).
    return new ApiError('auth-invalid-credentials', 'Неверный email или пароль');
  }
  if (code === 'user_already_exists' || code === 'email_exists') {
    return new ApiError('auth-email-taken', 'Этот email уже зарегистрирован');
  }
  if (code === 'weak_password') {
    return new ApiError('validation', 'Пароль — не короче 8 символов');
  }
  if (code === 'email_address_invalid' || code === 'validation_failed') {
    return new ApiError('validation', 'Проверьте email');
  }
  if (code === 'email_not_confirmed') {
    return new ApiError('validation', 'Подтвердите email по ссылке из письма');
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || error.status === 429) {
    return new ApiError('validation', 'Слишком много попыток. Подождите минуту');
  }
  return new ApiError('server', error.message ?? 'Auth error');
}

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || !/^-?\d+$/.test(value)) {
    return null;
  }
  return Number.parseInt(value, 10);
}
