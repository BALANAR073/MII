import { useResource } from '../../app/useResource';
import { getGroup, listGroups } from '../../mocks/mockApi';

/**
 * Список групп текущего пользователя (FR-2.1).
 * @param refreshKey Меняется после создания или выхода из группы, чтобы список перечитался.
 * @returns Состояние загрузки и функция перезагрузки.
 */
export function useGroups(refreshKey = 0) {
  return useResource(`groups:${refreshKey}`, listGroups);
}

/**
 * Данные одной группы: участники, расходы, переводы.
 * @param groupId Идентификатор группы из адреса.
 * @returns Состояние загрузки и функция перезагрузки.
 */
export function useGroup(groupId: string) {
  return useResource(`group:${groupId}`, () => getGroup(groupId));
}
