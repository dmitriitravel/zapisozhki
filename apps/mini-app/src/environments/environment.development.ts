import { AppEnvironment } from './interfaces';

/**
 * Development (`nx serve`): локальный Supabase из `supabase start`.
 * Ключ — стандартный публикуемый ключ локального стека Supabase CLI.
 */
export const environment: AppEnvironment = {
  production: false,
  supabaseUrl: 'http://127.0.0.1:54321',
  supabasePublishableKey: 'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
};
