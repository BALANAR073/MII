import { useCallback } from 'react';
import { getGroup, listGroups } from '../../api';
import { useResource } from '../../app/useResource';
import { todayIso } from '../../lib/dates';
import type { GroupDetails, GroupSummary, MemberId } from '../../types/group';
import { computeDashboard, type Dashboard } from './computeDashboard';

export interface DashboardData {
  groups: GroupSummary[];
  details: GroupDetails[];
  dashboard: Dashboard;
}

/**
 * Данные главной (ДЗ6): список групп и подробности каждой — параллельно, затем сводка.
 * Групп у пользователя единицы, поэтому отдельный RPC для сводки не нужен: считаем на клиенте той же логикой, что экран группы.
 * @param me Текущий пользователь.
 * @param refreshKey Меняется, чтобы перечитать данные.
 * @param activityLimit Сколько последних операций нужно.
 */
export function useDashboard(me: MemberId, refreshKey = 0, activityLimit = 8) {
  const loader = useCallback(async (): Promise<DashboardData> => {
    const groups = await listGroups();
    const details = await Promise.all(groups.map((group) => getGroup(group.id)));
    return { groups, details, dashboard: computeDashboard(details, me, todayIso(), activityLimit) };
  }, [me, activityLimit]);
  return useResource(`dashboard:${me}:${refreshKey}:${activityLimit}`, loader);
}
