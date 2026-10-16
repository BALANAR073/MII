/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Короткий хеш коммита сборки (задаётся в CI). */
  readonly VITE_APP_RELEASE?: string;
  /** Номер счётчика Яндекс.Метрики; без него метрика не подключается. */
  readonly VITE_YM_COUNTER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
