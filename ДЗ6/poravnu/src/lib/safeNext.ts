/** Длиннее внутренний путь не бывает; длинный `next` — признак подбора. */
const MAX_NEXT_LENGTH = 512;
/** Управляющие символы (U+0000–U+001F, U+007F) и обратный слэш. */
// eslint-disable-next-line no-control-regex -- именно управляющие символы и ищем
const UNSAFE_CHARS = /[\u0000-\u001f\u007f\\]/;

/**
 * Адрес возврата после входа. Только внутренний путь: `next=https://evil.example` или `//evil.example`
 * не должен уводить с сайта (open redirect, OWASP A01).
 *
 * Аудит ДЗ6: браузер вырезает из адреса табуляцию и переводы строк, а `\` считает за `/`,
 * поэтому `/\t/evil.example` или `/\evil.example` после нормализации становятся внешними.
 * Такие значения отбрасываются целиком: управляющие символы и обратный слэш в своих путях не нужны.
 * @param value Значение параметра `next`.
 * @returns Безопасный внутренний путь, по умолчанию `/`.
 */
export function safeNext(value: string | null): string {
  if (value === null || value.length > MAX_NEXT_LENGTH || UNSAFE_CHARS.test(value)) {
    return '/';
  }
  return value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
