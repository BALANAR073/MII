/**
 * Типы схемы базы для клиента Supabase — в формате `supabase gen types typescript`.
 * Описаны вручную по миграциям supabase/migrations; после изменения схемы их можно перегенерировать:
 * `npx supabase gen types typescript --project-id <ref> > src/api/database.types.ts`.
 * Деньги (bigint) PostgREST отдаёт обычными JSON-числами: суммы до 1 000 000 ₽ помещаются в 2⁵³.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type ProfileRow = { id: string; email: string; name: string; created_at: string };
type GroupRow = {
  id: string;
  name: string;
  emoji: string;
  owner_id: string;
  invite_token: string;
  hidden_at: string | null;
  created_at: string;
};
type MemberRow = { group_id: string; user_id: string; joined_at: string; left_at: string | null };
type ExpenseRow = {
  id: string;
  group_id: string;
  title: string;
  amount_kop: number;
  payer_id: string;
  split: Json;
  category: string | null;
  date: string;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type TransferRow = {
  id: string;
  group_id: string;
  from_id: string;
  to_id: string;
  amount_kop: number;
  created_by: string;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: never;
        Update: { name?: string };
        Relationships: [];
      };
      groups: {
        Row: GroupRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      members: {
        Row: MemberRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      expenses: {
        Row: ExpenseRow;
        Insert: {
          group_id: string;
          title: string;
          amount_kop: number;
          payer_id: string;
          split: Json;
          date?: string;
          category?: string | null;
        };
        Update: {
          title?: string;
          amount_kop?: number;
          payer_id?: string;
          split?: Json;
          date?: string;
          category?: string | null;
        };
        Relationships: [];
      };
      transfers: {
        Row: TransferRow;
        Insert: { group_id: string; from_id: string; to_id: string; amount_kop: number };
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_group: { Args: { p_name: string; p_emoji?: string }; Returns: GroupRow };
      get_invite_preview: {
        Args: { p_token: string };
        Returns: { group_name: string; emoji: string; members_count: number }[];
      };
      join_group: { Args: { p_token: string }; Returns: string };
      leave_group: { Args: { p_group: string }; Returns: undefined };
      rotate_invite: { Args: { p_group: string }; Returns: string };
      my_groups: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          emoji: string;
          active_members_count: number;
          my_balance_kop: number;
          last_activity_at: string;
        }[];
      };
      group_balances: { Args: { p_group: string }; Returns: { member_id: string; balance_kop: number }[] };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
