import { Injectable } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

/** Ключ localStorage, под которым supabase-js хранит сессию. */
const AUTH_STORAGE_KEY = 'memo-cloud-auth';

/**
 * Единственный экземпляр клиента Supabase. Библиотека подгружается лениво,
 * чтобы не утяжелять стартовый бандл, когда облако не используется.
 */
@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  private clientPromise: Promise<SupabaseClient> | null = null;

  isConfigured(): boolean {
    return environment.supabaseUrl !== '' && environment.supabasePublishableKey !== '';
  }

  getClient(): Promise<SupabaseClient> {
    if (!this.isConfigured()) {
      return Promise.reject(new Error('Supabase не настроен'));
    }
    if (!this.clientPromise) {
      this.clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
        createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: false,
            storageKey: AUTH_STORAGE_KEY,
          },
        })
      );
    }
    return this.clientPromise;
  }
}
