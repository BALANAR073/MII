/**
 * Адрес возврата после входа. Только внутренний путь: `next=https://evil.example` или `//evil.example`
 * не должен уводить с сайта (open redirect, OWASP A01).
 * @param value Значение параметра `next`.
 * @returns Безопасный внутренний путь, по умолчанию `/`.
 */
export function safeNext(value: string | null): string {
  return value !== null && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}
