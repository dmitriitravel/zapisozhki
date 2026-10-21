import { Bot, InlineKeyboard } from 'grammy';
import { loadConfig } from './config';
import { BotConfig } from './interfaces';

const WELCOME_TEXT = [
  '👋 Привет! Это MemoCards — карточки с интервальным повторением.',
  '',
  '• Создавайте колоды по темам и добавляйте вопросы с ответами и картинками.',
  '• Каждый день приложение само подбирает, что пора повторить.',
  '• Чем лучше помните карточку, тем реже она показывается.',
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

function createOpenKeyboard(config: BotConfig): InlineKeyboard {
  return new InlineKeyboard().webApp('📚 Открыть карточки', config.webAppUrl);
}

async function registerMenu(bot: Bot, config: BotConfig): Promise<void> {
  await bot.api.setMyCommands([
    { command: 'start', description: 'Открыть карточки' },
    { command: 'help', description: 'Справка' },
  ]);
  await bot.api.setChatMenuButton({
    menu_button: {
      type: 'web_app',
      text: 'Карточки',
      web_app: { url: config.webAppUrl },
    },
  });
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const bot = new Bot(config.token);
  const keyboard = createOpenKeyboard(config);

  bot.command('start', (ctx) =>
    ctx.reply(WELCOME_TEXT, { reply_markup: keyboard })
  );
  bot.command('help', (ctx) => ctx.reply(HELP_TEXT, { reply_markup: keyboard }));
  bot.on('message', (ctx) =>
    ctx.reply('Откройте приложение, чтобы работать с карточками:', {
      reply_markup: keyboard,
    })
  );

  bot.catch((error) => {
    console.error('Ошибка при обработке апдейта', error.error);
  });

  await registerMenu(bot, config);

  const stop = (): void => {
    void bot.stop();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);

  console.log(`Бот запущен. Mini App: ${config.webAppUrl}`);
  await bot.start();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
