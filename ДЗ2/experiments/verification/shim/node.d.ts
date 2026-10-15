declare module 'node:assert/strict' { export function deepStrictEqual(a: unknown, b: unknown, m?: string): void; export function ok(v: unknown, m?: string): asserts v; }
declare module 'node:util' { export function isDeepStrictEqual(a: unknown, b: unknown): boolean; }
