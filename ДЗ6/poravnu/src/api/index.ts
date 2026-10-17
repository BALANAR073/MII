import * as mockData from '../mocks/mockApi';
import { mockAuth } from '../mocks/mockAuth';
import type { AuthApi, DataApi } from '../types/api';
import { createSupabaseApis } from './supabaseApi';

/**
 * Точка выбора бэкенда. Если заданы VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (файл .env.local),
 * приложение работает с Supabase; иначе — с mock-API (демо без сервера и все автотесты).
 * Компоненты импортируют функции только отсюда и не знают, какой бэкенд под ними.
 */

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Приложение подключено к Supabase (а не к mock-данным). */
export const IS_SUPABASE =
  typeof url === 'string' && url !== '' && typeof anonKey === 'string' && anonKey !== '' && import.meta.env.MODE !== 'test';

const apis: { data: DataApi; auth: AuthApi } = IS_SUPABASE
  ? createSupabaseApis(url ?? '', anonKey ?? '')
  : { data: mockData, auth: mockAuth };

export const auth: AuthApi = apis.auth;
export const {
  listGroups,
  getGroup,
  createGroup,
  addExpense,
  updateExpense,
  deleteExpense,
  addTransfer,
  deleteTransfer,
  leaveGroup,
  getInviteLink,
  getInvitePreview,
  joinGroup,
  claimMember,
  addMember,
  renameMember,
  removeMember,
  updateGroup,
  rotateInvite,
} = apis.data;
