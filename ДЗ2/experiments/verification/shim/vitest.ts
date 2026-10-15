// Минимальная замена vitest (describe/it/expect) для запуска тестов без доступа к npm
import { deepStrictEqual, ok } from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

type Fn = () => void | Promise<void>;
export const registry: { name: string; fn: Fn }[] = [];
const stack: string[] = [];
export function describe(name: string, fn: () => void): void { stack.push(name); fn(); stack.pop(); }
type Args<T> = T extends readonly unknown[] ? T : [T];
function fmt(name: string, c: unknown): string {
  if (c !== null && typeof c === 'object' && !Array.isArray(c)) return name.replace(/\$(\w+)/g, (_, k: string) => String((c as Record<string, unknown>)[k]));
  const arr = Array.isArray(c) ? c : [c];
  let i = 0; return name.replace(/%[sdi]/g, () => String(arr[i++]));
}
function itBase(name: string, fn: Fn): void { registry.push({ name: [...stack, name].join(' › '), fn }); }
export const it = Object.assign(itBase, {
  each<T>(cases: readonly T[]) {
    return (name: string, fn: (...args: Args<T>) => void | Promise<void>): void => {
      for (const c of cases) itBase(fmt(name, c), () => fn(...((Array.isArray(c) ? c : [c]) as Args<T>)));
    };
  },
});
export const test = it;

function partial(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return isDeepStrictEqual(actual, expected);
  if (actual === null || typeof actual !== 'object') return false;
  if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every((e, i) => partial((actual as unknown[])[i], e));
  return Object.entries(expected).every(([k, v]) => partial((actual as Record<string, unknown>)[k], v));
}

export function expect(actual: unknown) {
  const m = {
    toBe: (e: unknown) => ok(Object.is(actual, e), `ожидалось ${String(e)}, получено ${String(actual)}`),
    toEqual: (e: unknown) => deepStrictEqual(JSON.parse(JSON.stringify(actual ?? null)), JSON.parse(JSON.stringify(e ?? null))),
    toMatchObject: (e: unknown) => ok(partial(actual, e), `не совпадает с ${JSON.stringify(e)}: ${JSON.stringify(actual)}`),
    toBeTruthy: () => ok(Boolean(actual)),
    toContain: (e: unknown) => ok((actual as string | unknown[]).includes(e as never), `не содержит ${String(e)}`),
    toHaveLength: (n: number) => ok((actual as { length: number }).length === n, `длина ${(actual as { length: number }).length} ≠ ${n}`),
    toBeLessThanOrEqual: (n: number) => ok((actual as number) <= n, `${String(actual)} > ${n}`),
    toThrow: (E?: unknown) => {
      try { (actual as () => unknown)(); } catch (err) {
        if (typeof E === 'function') ok(err instanceof (E as new () => Error), `брошено ${(err as Error).name}, ожидался ${(E as { name: string }).name}`);
        return;
      }
      throw new Error('функция не бросила исключение');
    },
  };
  return m;
}
