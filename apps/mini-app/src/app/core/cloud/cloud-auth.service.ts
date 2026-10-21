import { Injectable, inject } from '@angular/core';
import { TelegramService } from '@memo/shared/telegram';
import type { Session } from '@supabase/supabase-js';
import { CloudSession, TelegramAuthResponse } from './interfaces';
import { SupabaseClientService } from './supabase-client.service';

/**
 * Вход в Supabase по данным запуска Telegram Mini App (initData).
 * Edge Function telegram-auth проверяет подпись и выдаёт одноразовый token_hash,
 * который обменивается на обычную сессию Supabase с refresh-токеном.
 */
@Injectable({ providedIn: 'root' })
export class CloudAuthService {
  private readonly supabase = inject(SupabaseClientService);
  private readonly telegram = inject(TelegramService);

  /** Облако доступно, если настроен Supabase и есть initData (приложение открыто в Telegram). */
  isAvailable(): boolean {
    return this.supabase.isConfigured() && this.telegram.getInitData() !== '';
  }

  /** Возвращает действующую сессию, при необходимости выполняя вход. */
  async ensureSession(): Promise<CloudSession | null> {
    const client = await this.supabase.getClient();
    const {
      data: { session },
    } = await client.auth.getSession();
    const telegramId = this.telegram.getUser()?.id ?? null;

    if (session && matchesTelegramUser(session, telegramId)) {
      return toCloudSession(session);
    }
    if (session) {
      // На устройстве вошёл другой пользователь Telegram — старую сессию закрываем.
      await client.auth.signOut();
    }

    const initData = this.telegram.getInitData();
    if (!initData) {
      return null;
    }

    const { data, error } = await client.functions.invoke<TelegramAuthResponse>(
      'telegram-auth',
      { body: { initData } }
    );
    if (error || !data) {
      throw new Error(await describeFunctionError(error));
    }

    const { data: verified, error: verifyError } = await client.auth.verifyOtp({
      token_hash: data.tokenHash,
      type: 'magiclink',
    });
    if (verifyError || !verified.session) {
      throw new Error(verifyError?.message ?? 'Не удалось создать сессию');
    }
    return toCloudSession(verified.session);
  }

  async signOut(): Promise<void> {
    const client = await this.supabase.getClient();
    await client.auth.signOut();
  }
}

function matchesTelegramUser(session: Session, telegramId: number | null): boolean {
  if (telegramId === null) {
    return true;
  }
  const claimed = session.user.app_metadata?.['telegram_id'];
  return typeof claimed !== 'number' || claimed === telegramId;
}

function toCloudSession(session: Session): CloudSession {
  const telegramId = session.user.app_metadata?.['telegram_id'];
  return {
    userId: session.user.id,
    telegramId: typeof telegramId === 'number' ? telegramId : null,
  };
}

/** Достаёт текст ошибки из ответа Edge Function (supabase-js прячет его в context). */
async function describeFunctionError(error: unknown): Promise<string> {
  const fallback = 'Не удалось войти через Telegram';
  if (!error || typeof error !== 'object') {
    return fallback;
  }
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = (await context.clone().json()) as { error?: string };
      if (body.error) {
        return body.error;
      }
    } catch {
      // Тело не JSON — вернём общее сообщение.
    }
  }
  const message = (error as { message?: string }).message;
  return message ? `${fallback}: ${message}` : fallback;
}
