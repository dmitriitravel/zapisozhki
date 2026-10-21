// Telegram-бот MemoCards в режиме webhook — работает как Supabase Edge Function,
// отдельный сервер не нужен. Та же логика, что и в apps/bot (long polling).
//
// Регистрация вебхука, команд и кнопки меню — один раз скриптом tools/telegram-setup.mjs.
// Секреты функции: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEB_APP_URL.

import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import { Bot, InlineKeyboard, webhookCallback } from 'grammy';

const WELCOME_TEXT = [
  '👋 Привет! Это MemoCards — карточки с интервальным повторением.',
  '',
  '• Создавайте колоды по темам и добавляйте вопросы с ответами и картинками.',
  '• Каждый день приложение само подбирает, что пора повторить.',
  '• Чем лучше помните карточку, тем реже она показывается.',
  '• Данные хранятся в облаке и доступны на всех ваших устройствах.',
  '',
  'Нажмите кнопку ниже, чтобы открыть приложение.',
].join('\n');

const HELP_TEXT = [
  'Команды:',
  '/start — открыть приложение',
  '/help — эта справка',
  '',
  'Приложение также доступно через кнопку меню слева от поля ввода.',
].join('\n');

interface BotEnv {
  readonly token: string;
  readonly webAppUrl: string;
  readonly webhookSecret: string;
}

function readEnv(): BotEnv | null {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN')?.trim();
  const webAppUrl = Deno.env.get('WEB_APP_URL')?.trim();
  const webhookSecret = Deno.env.get('TELEGRAM_WEBHOOK_SECRET')?.trim();
  if (!token || !webAppUrl || !webhookSecret) {
    return null;
  }
  return { token, webAppUrl, webhookSecret };
}

function createBot(env: BotEnv): Bot {
  const bot = new Bot(env.token);
  const keyboard = new InlineKeyboard().webApp('📚 Открыть карточки', env.webAppUrl);

  bot.command('start', (ctx) => ctx.reply(WELCOME_TEXT, { reply_markup: keyboard }));
  bot.command('help', (ctx) => ctx.reply(HELP_TEXT, { reply_markup: keyboard }));
  bot.on('message', (ctx) =>
    ctx.reply('Откройте приложение, чтобы работать с карточками:', {
      reply_markup: keyboard,
    })
  );
  bot.catch((error) => {
    console.error('telegram-bot: ошибка при обработке апдейта', error.error);
  });
  return bot;
}

const env = readEnv();
const handleUpdate = env
  ? webhookCallback(createBot(env), 'std/http', { secretToken: env.webhookSecret })
  : null;

export default {
  fetch: withSupabase({ auth: 'none' }, async (req) => {
    if (req.method !== 'POST') {
      return new Response('MemoCards bot is running', { status: 200 });
    }
    if (!handleUpdate) {
      console.error(
        'telegram-bot: не заданы секреты TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET / WEB_APP_URL'
      );
      return new Response('Bot is not configured', { status: 500 });
    }
    try {
      return await handleUpdate(req);
    } catch (error) {
      console.error('telegram-bot: webhook error', error);
      // Telegram повторяет доставку при не-2xx; при ошибке подписи отвечаем 401.
      const status = error instanceof Error && /secret/i.test(error.message) ? 401 : 200;
      return new Response('error', { status });
    }
  }),
};
