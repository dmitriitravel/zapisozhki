#!/usr/bin/env node
/**
 * Одноразовая настройка Telegram-бота: команды, кнопка меню с Mini App и вебхук.
 *
 * Переменные окружения (можно взять из supabase/functions/.env):
 *   TELEGRAM_BOT_TOKEN       — токен от @BotFather (обязательно)
 *   WEB_APP_URL              — HTTPS-адрес мини-приложения (обязательно)
 *   TELEGRAM_WEBHOOK_URL     — адрес вебхука; если не задан, берётся
 *                              ${SUPABASE_URL}/functions/v1/telegram-bot
 *   TELEGRAM_WEBHOOK_SECRET  — секрет вебхука (обязателен вместе с вебхуком)
 *   TELEGRAM_POLLING=1       — вместо вебхука снять его (для запуска apps/bot по long polling)
 *
 * Пример:
 *   node --env-file=supabase/functions/.env tools/telegram-setup.mjs
 */

const env = process.env;

function required(name) {
  const value = env[name]?.trim();
  if (!value) {
    console.error(`Не задана переменная ${name}`);
    process.exit(1);
  }
  return value;
}

const token = required('TELEGRAM_BOT_TOKEN');
const webAppUrl = required('WEB_APP_URL');
const usePolling = env.TELEGRAM_POLLING === '1';
const webhookUrl =
  env.TELEGRAM_WEBHOOK_URL?.trim() ||
  (env.SUPABASE_URL ? `${env.SUPABASE_URL.replace(/\/$/, '')}/functions/v1/telegram-bot` : '');
const webhookSecret = env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? '';

async function call(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`${method}: ${data.description ?? 'ошибка Telegram API'}`);
  }
  return data.result;
}

async function main() {
  const me = await call('getMe');
  console.log(`Бот: @${me.username} (id ${me.id})`);

  await call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Открыть карточки' },
      { command: 'help', description: 'Справка' },
    ],
  });
  await call('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Карточки', web_app: { url: webAppUrl } },
  });
  console.log(`Кнопка меню → ${webAppUrl}`);

  if (usePolling) {
    await call('deleteWebhook', { drop_pending_updates: false });
    console.log('Вебхук снят — бот будет работать по long polling (apps/bot).');
    return;
  }

  if (!webhookUrl || !webhookSecret) {
    console.error(
      'Для вебхука нужны TELEGRAM_WEBHOOK_URL (или SUPABASE_URL) и TELEGRAM_WEBHOOK_SECRET'
    );
    process.exit(1);
  }
  await call('setWebhook', {
    url: webhookUrl,
    secret_token: webhookSecret,
    allowed_updates: ['message'],
    drop_pending_updates: false,
  });
  const info = await call('getWebhookInfo');
  console.log(`Вебхук → ${info.url}${info.last_error_message ? ` (последняя ошибка: ${info.last_error_message})` : ''}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
