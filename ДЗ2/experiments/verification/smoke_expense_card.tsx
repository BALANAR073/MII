import { renderToStaticMarkup } from 'react-dom/server';
import { ExpenseCard } from './src/features/expenses/ExpenseCard';
import type { Expense, Member } from './src/types/expense';
const MEMBERS: Member[] = [{ id: 'a', name: 'Аня' }, { id: 'b', name: 'Боря' }, { id: 'c', name: 'Вика' }];
const E: Expense = { id: 'e1', title: 'Ужин в кафе', amountKop: 100000, payerId: 'a', participantIds: ['a', 'b', 'c'] };
const cases: [string, Expense, string, string[]][] = [
  ['участник', E, 'b', ['1 000,00 ₽', 'Аня', '3 человека', '333,33 ₽', 'Вы должны 333,33 ₽', 'text-rose-600']],
  ['плательщик', E, 'a', ['Вы', '333,34 ₽', 'Вам должны 666,66 ₽', 'text-emerald-600']],
  ['не участвует', E, 'z', ['Вы не участвуете в этом расходе', '0,00 ₽']],
  ['без участников', { ...E, participantIds: [] }, 'b', ['Участники расхода не указаны', '0 человек']],
  ['неизвестный плательщик', { ...E, payerId: 'ghost' }, 'b', ['Неизвестный участник']],
];
let ok = 0;
for (const [name, exp, user, needles] of cases) {
  const html = renderToStaticMarkup(<ExpenseCard expense={exp} members={MEMBERS} currentUserId={user} />);
  const miss = needles.filter((n) => !html.includes(n));
  console.log(miss.length ? `✖ ${name}: нет ${miss.join(', ')}` : `✔ ${name}`); if (!miss.length) ok++;
}
console.log(`сценариев: ${cases.length}, прошло: ${ok}`);
