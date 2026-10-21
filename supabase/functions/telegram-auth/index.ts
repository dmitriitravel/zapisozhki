// Авторизация пользователя Telegram Mini App в Supabase.
//
// Клиент присылает initData (подписанные Telegram данные запуска). Функция проверяет
// подпись токеном бота, находит или создаёт пользователя Supabase Auth, привязанного
// к Telegram ID, обновляет профиль и возвращает одноразовый token_hash. Клиент
// обменивает его на сессию через supabase.auth.verifyOtp({ type: 'magiclink', token_hash }).
//
// verify_jwt = false (см. config.toml): у клиента ещё нет сессии, авторизацией служит initData.

import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  InitDataError,
  type TelegramInitDataUser,
  validateInitData,
} from '../_shared/telegram-init-data.ts';

/** Сколько времени initData считается свежим (24 часа — рекомендация Telegram). */
const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

const CORS_HEADERS: Readonly<Record<string, string>> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface AuthRequestBody {
  readonly initData?: string;
}

interface ProfileRow {
  readonly user_id: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Служебный e-mail: Supabase Auth требует идентификатор, Telegram его не даёт. */
function emailForTelegramId(telegramId: number): string {
  return `tg${telegramId}@telegram.local`;
}

function resolveAdminClient(provided: SupabaseClient | undefined): SupabaseClient {
  if (provided) {
    return provided;
  }
  const url = Deno.env.get('SUPABASE_URL');
  const secretKey =
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY');
  if (!url || !secretKey) {
    throw new Error('Не настроены SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Создаёт пользователя Auth, если его ещё нет. Возвращает id существующего или нового. */
async function ensureAuthUser(
  admin: SupabaseClient,
  telegramUser: TelegramInitDataUser
): Promise<string | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('user_id')
    .eq('telegram_id', telegramUser.id)
    .maybeSingle<ProfileRow>();
  if (profile) {
    return profile.user_id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: emailForTelegramId(telegramUser.id),
    email_confirm: true,
    // app_metadata редактирует только сервер — на него можно опираться в политиках.
    app_metadata: { provider: 'telegram', telegram_id: telegramUser.id },
    user_metadata: {
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name ?? '',
      username: telegramUser.username ?? '',
    },
  });
  if (error) {
    // Пользователь уже существует (например, профиль был удалён вручную) — возьмём его из ссылки.
    if (error.code === 'email_exists' || error.status === 422) {
      return null;
    }
    throw error;
  }
  return data.user.id;
}

async function upsertProfile(
  admin: SupabaseClient,
  userId: string,
  telegramUser: TelegramInitDataUser
): Promise<void> {
  const { error } = await admin.from('profiles').upsert(
    {
      user_id: userId,
      telegram_id: telegramUser.id,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name ?? '',
      username: telegramUser.username ?? '',
      photo_url: telegramUser.photo_url ?? '',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) {
    throw error;
  }
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (req.method !== 'POST') {
      return json({ error: 'Метод не поддерживается' }, 405);
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN');
    if (!botToken) {
      console.error('telegram-auth: не задан секрет TELEGRAM_BOT_TOKEN');
      return json({ error: 'Сервер не настроен' }, 500);
    }

    let body: AuthRequestBody;
    try {
      body = (await req.json()) as AuthRequestBody;
    } catch {
      return json({ error: 'Ожидается JSON с полем initData' }, 400);
    }

    try {
      const { user } = await validateInitData(
        body.initData ?? '',
        botToken,
        INIT_DATA_MAX_AGE_SECONDS
      );
      const admin = resolveAdminClient(ctx.supabaseAdmin);
      const email = emailForTelegramId(user.id);

      const knownUserId = await ensureAuthUser(admin, user);
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });
      if (linkError || !link) {
        throw linkError ?? new Error('generateLink вернул пустой ответ');
      }

      const userId = knownUserId ?? link.user.id;
      await upsertProfile(admin, userId, user);

      return json({
        tokenHash: link.properties.hashed_token,
        userId,
        telegramId: user.id,
      });
    } catch (error) {
      if (error instanceof InitDataError) {
        return json({ error: error.message }, 401);
      }
      console.error('telegram-auth: ошибка', error);
      return json({ error: 'Не удалось авторизоваться' }, 500);
    }
  }),
};
