import { BotConfig } from './interfaces';

export function loadConfig(env: NodeJS.ProcessEnv): BotConfig {
  const token = env['BOT_TOKEN']?.trim();
  const webAppUrl = env['WEB_APP_URL']?.trim();

  if (!token) {
    throw new Error('Не задана переменная окружения BOT_TOKEN (токен от @BotFather)');
  }
  if (!webAppUrl || !webAppUrl.startsWith('https://')) {
    throw new Error(
      'Не задана переменная окружения WEB_APP_URL или она не начинается с https:// ' +
        '(Telegram открывает мини-приложения только по HTTPS)'
    );
  }

  return { token, webAppUrl };
}
