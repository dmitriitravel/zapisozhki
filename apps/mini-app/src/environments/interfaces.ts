export interface AppEnvironment {
  readonly production: boolean;
  /** URL проекта Supabase (https://<ref>.supabase.co). Пусто — облачная синхронизация выключена. */
  readonly supabaseUrl: string;
  /** Публикуемый ключ Supabase (sb_publishable_…) — безопасен для фронтенда, доступ ограничен RLS. */
  readonly supabasePublishableKey: string;
}
