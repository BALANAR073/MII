import { addExpense, addMember, addTransfer, createGroup } from '../../api';
import { todayIso } from '../../lib/dates';
import type { MemberId } from '../../types/group';

/**
 * «Попробовать на примере» (ДЗ6): новая группа с тремя участниками по имени, расходами разных категорий
 * и одним переводом — чтобы новый пользователь сразу увидел балансы, «кто кому должен» и статистику.
 * Это обычная группа: её можно править, а участники займут свои места по ссылке, если это реальные друзья.
 * @param me Текущий пользователь.
 * @returns id созданной группы.
 */
export async function createSampleGroup(me: MemberId): Promise<string> {
  const group = await createGroup({ name: 'Пример: выходные в Питере', emoji: '✈️' });
  // Запросы независимы — отправляем параллельно, иначе на живом сервере пример собирается секунды.
  const [anyaMember, vikaMember, goshaMember] = await Promise.all([
    addMember(group.id, 'Аня'),
    addMember(group.id, 'Вика'),
    addMember(group.id, 'Гоша'),
  ]);
  const [anya, vika, gosha] = [anyaMember.id, vikaMember.id, goshaMember.id];
  const everyone = [me, anya, vika, gosha];
  const day = (offset: number) => todayIso(new Date(Date.now() - offset * 24 * 60 * 60 * 1000));

  await Promise.all([
    addExpense(group.id, {
      title: 'Билеты на «Сапсан»',
      amountKop: 1_280_000,
      payerId: me,
      split: { kind: 'equal', memberIds: everyone },
      date: day(3),
      category: 'travel',
    }),
    addExpense(group.id, {
      title: 'Квартира на две ночи',
      amountKop: 960_000,
      payerId: anya,
      split: { kind: 'equal', memberIds: everyone },
      date: day(2),
      category: 'housing',
    }),
    addExpense(group.id, {
      title: 'Ужин на Рубинштейна',
      amountKop: 420_050,
      payerId: vika,
      split: {
        kind: 'shares',
        shares: [
          { memberId: me, weight: 1 },
          { memberId: anya, weight: 1 },
          { memberId: vika, weight: 1 },
          { memberId: gosha, weight: 2 },
        ],
      },
      date: day(2),
      category: 'food',
    }),
    addExpense(group.id, {
      title: 'Такси из аэропорта',
      amountKop: 89_000,
      payerId: gosha,
      split: { kind: 'equal', memberIds: [me, gosha] },
      date: day(1),
      category: 'transport',
    }),
    addExpense(group.id, {
      title: 'Эрмитаж',
      amountKop: 200_000,
      payerId: me,
      split: { kind: 'equal', memberIds: everyone },
      date: day(1),
      category: 'fun',
    }),
    addTransfer(group.id, { fromId: gosha, toId: me, amountKop: 150_000 }),
  ]);
  return group.id;
}
