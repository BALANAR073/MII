import { describe, expect, it } from 'vitest';
import type { Member } from '../types/group';
import { memberColorIndex } from './memberColor';

const MEMBERS: Member[] = [
  { id: 'a', name: 'Аня', joinedAt: '2026-10-01T00:00:00.000Z', leftAt: '2026-10-05T00:00:00.000Z' },
  { id: 'b', name: 'Боря', joinedAt: '2026-10-02T00:00:00.000Z', leftAt: null },
];

describe('memberColorIndex', () => {
  it('считает позицию среди всех участников, включая вышедших', () => {
    expect(memberColorIndex(MEMBERS, 'b')).toBe(1);
  });

  it('для неизвестного участника возвращает 0, а не −1', () => {
    expect(memberColorIndex(MEMBERS, 'ghost')).toBe(0);
  });
});
