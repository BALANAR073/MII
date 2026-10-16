import type { Member, MemberId } from '../types/group';

/**
 * Индекс цвета аватара — позиция участника среди всех участников группы, включая вышедших.
 * Один источник для всех экранов, чтобы цвет человека не менялся (находка 19 AI-ревью).
 * @param members Все участники группы в порядке вступления.
 * @param memberId Участник.
 * @returns Индекс не меньше 0 (для неизвестного id — 0).
 */
export function memberColorIndex(members: readonly Member[], memberId: MemberId): number {
  return Math.max(0, members.findIndex((member) => member.id === memberId));
}
