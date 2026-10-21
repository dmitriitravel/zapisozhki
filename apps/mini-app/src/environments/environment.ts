import { AppEnvironment } from './interfaces';

/** Production: проект Supabase «zapisochki». Значения публичные (ограничены RLS). */
export const environment: AppEnvironment = {
  production: true,
  supabaseUrl: '',
  supabasePublishableKey: '',
};
