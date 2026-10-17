import type { Expense, Group, Transfer } from '../types/group';

export interface MockDb {
  groups: Group[];
  expenses: Expense[];
  transfers: Transfer[];
}

/** Эмодзи на выбор при создании группы (FR-2.2, решение Q10). */
export const GROUP_EMOJIS = ['💸', '🏙', '🏠', '🎂', '🏕', '✈️', '🍕', '🎉'] as const;

const KAZAN = 'kazan';
const FLAT = 'flat';
const BIRTHDAY = 'birthday';

/**
 * Данные UI-концепций ДЗ3: «Поездка в Казань», 4 расхода на 17 056,77 ₽.
 * Балансы: Аня +8 135,80, Боря −940,75, Вика −3 197,53, Гоша −3 997,52 (AC-07.1).
 */
export function createSeed(): MockDb {
  return {
    groups: [
      {
        id: KAZAN,
        name: 'Поездка в Казань',
        emoji: '🏙',
        ownerId: 'anya',
        inviteToken: 'kzn-2026',
        createdAt: '2026-10-09T18:00:00.000Z',
        members: [
          { id: 'anya', name: 'Аня', joinedAt: '2026-10-09T18:00:00.000Z', leftAt: null },
          { id: 'borya', name: 'Боря', joinedAt: '2026-10-09T18:05:00.000Z', leftAt: null },
          { id: 'vika', name: 'Вика', joinedAt: '2026-10-09T18:10:00.000Z', leftAt: null },
          { id: 'gosha', name: 'Гоша', joinedAt: '2026-10-09T18:20:00.000Z', leftAt: null },
        ],
      },
      {
        id: FLAT,
        name: 'Квартира на Ленина',
        emoji: '🏠',
        ownerId: 'vika',
        inviteToken: 'flat-lenina',
        createdAt: '2026-09-01T09:00:00.000Z',
        members: [
          { id: 'vika', name: 'Вика', joinedAt: '2026-09-01T09:00:00.000Z', leftAt: null },
          { id: 'borya', name: 'Боря', joinedAt: '2026-09-01T09:30:00.000Z', leftAt: null },
          { id: 'lesha', name: 'Лёша', joinedAt: '2026-09-02T12:00:00.000Z', leftAt: null, isVirtual: true },
        ],
      },
      {
        id: BIRTHDAY,
        name: 'День рождения Вики',
        emoji: '🎂',
        ownerId: 'borya',
        inviteToken: 'bday-vika',
        createdAt: '2026-10-14T20:00:00.000Z',
        members: [
          { id: 'borya', name: 'Боря', joinedAt: '2026-10-14T20:00:00.000Z', leftAt: null },
          { id: 'gosha', name: 'Гоша', joinedAt: '2026-10-14T20:15:00.000Z', leftAt: null },
        ],
      },
    ],
    expenses: [
      {
        id: 'e-hostel',
        groupId: KAZAN,
        title: 'Хостел',
        category: 'housing',
        amountKop: 1_200_000,
        payerId: 'anya',
        split: { kind: 'equal', memberIds: ['anya', 'borya', 'vika', 'gosha'] },
        date: '2026-10-10',
        createdBy: 'anya',
        createdAt: '2026-10-10T09:00:00.000Z',
      },
      {
        id: 'e-food',
        groupId: KAZAN,
        title: 'Продукты',
        category: 'groceries',
        amountKop: 345_678,
        payerId: 'borya',
        split: { kind: 'equal', memberIds: ['anya', 'borya', 'vika', 'gosha'] },
        date: '2026-10-10',
        createdBy: 'borya',
        createdAt: '2026-10-10T19:30:00.000Z',
      },
      {
        id: 'e-taxi',
        groupId: KAZAN,
        title: 'Такси',
        category: 'transport',
        amountKop: 99_999,
        payerId: 'vika',
        split: { kind: 'equal', memberIds: ['borya', 'vika', 'gosha'] },
        date: '2026-10-11',
        createdBy: 'vika',
        createdAt: '2026-10-11T23:10:00.000Z',
      },
      {
        id: 'e-coffee',
        groupId: KAZAN,
        title: 'Кофе',
        category: 'food',
        amountKop: 60_000,
        payerId: 'gosha',
        split: {
          kind: 'shares',
          shares: [
            { memberId: 'borya', weight: 1 },
            { memberId: 'gosha', weight: 2 },
          ],
        },
        date: '2026-10-12',
        createdBy: 'gosha',
        createdAt: '2026-10-12T10:15:00.000Z',
      },
      {
        id: 'e-rent',
        groupId: FLAT,
        title: 'Аренда за октябрь',
        category: 'housing',
        amountKop: 4_000_000,
        payerId: 'vika',
        split: { kind: 'equal', memberIds: ['vika', 'borya', 'lesha'] },
        date: '2026-10-01',
        createdBy: 'vika',
        createdAt: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'e-internet',
        groupId: FLAT,
        title: 'Интернет',
        category: 'bills',
        amountKop: 60_000,
        payerId: 'borya',
        split: { kind: 'equal', memberIds: ['vika', 'borya', 'lesha'] },
        date: '2026-10-03',
        createdBy: 'borya',
        createdAt: '2026-10-03T08:00:00.000Z',
      },
    ],
    transfers: [
      {
        id: 't-borya-vika',
        groupId: FLAT,
        fromId: 'borya',
        toId: 'vika',
        amountKop: 1_293_333,
        createdBy: 'borya',
        createdAt: '2026-10-04T12:00:00.000Z',
      },
      {
        id: 't-lesha-vika',
        groupId: FLAT,
        fromId: 'lesha',
        toId: 'vika',
        amountKop: 1_000_000,
        createdBy: 'lesha',
        createdAt: '2026-10-05T12:00:00.000Z',
      },
    ],
  };
}
