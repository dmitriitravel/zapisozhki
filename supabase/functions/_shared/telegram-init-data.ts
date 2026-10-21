/**
 * Проверка подписи Telegram Mini App initData.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 *
 * Алгоритм: secret = HMAC_SHA256(key = "WebAppData", data = bot_token);
 * hash = hex(HMAC_SHA256(key = secret, data = data_check_string)), где data_check_string —
 * все пары key=value (кроме hash), отсортированные по ключу и соединённые через "\n".
 */

export interface TelegramInitDataUser {
  readonly id: number;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly photo_url?: string;
  readonly language_code?: string;
}

export interface ValidatedInitData {
  readonly user: TelegramInitDataUser;
  readonly authDate: number;
}

export class InitDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InitDataError';
  }
}

const encoder = new TextEncoder();

async function hmacSha256(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(data));
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Сравнение строк за постоянное время, чтобы не утекала информация о совпавшем префиксе. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const mismatch = Array.from(a).reduce(
    (acc, char, index) => acc | (char.charCodeAt(0) ^ b.charCodeAt(index)),
    0
  );
  return mismatch === 0;
}

/** Подписывает набор параметров так же, как это делает Telegram (нужно для тестов и dev-режима). */
export async function signInitData(
  params: Readonly<Record<string, string>>,
  botToken: string
): Promise<string> {
  const dataCheckString = Object.keys(params)
    .filter((key) => key !== 'hash')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('\n');
  const secret = await hmacSha256(encoder.encode('WebAppData'), botToken);
  const signature = await hmacSha256(secret, dataCheckString);
  return toHex(signature);
}

/**
 * Проверяет подпись и свежесть initData. Бросает InitDataError, если данные невалидны.
 * @param maxAgeSeconds — максимальный возраст auth_date (Telegram рекомендует ограничивать).
 */
export async function validateInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number,
  nowMs: number = Date.now()
): Promise<ValidatedInitData> {
  if (!initData) {
    throw new InitDataError('initData пуст');
  }
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw new InitDataError('В initData нет hash');
  }

  const entries = Object.fromEntries(
    Array.from(params.entries()).filter(([key]) => key !== 'hash')
  );
  const expected = await signInitData(entries, botToken);
  if (!timingSafeEqual(expected, hash)) {
    throw new InitDataError('Подпись initData не совпадает');
  }

  const authDate = Number(params.get('auth_date'));
  if (!Number.isFinite(authDate) || authDate <= 0) {
    throw new InitDataError('Некорректный auth_date');
  }
  if (nowMs / 1000 - authDate > maxAgeSeconds) {
    throw new InitDataError('initData устарел — откройте приложение заново');
  }

  const rawUser = params.get('user');
  if (!rawUser) {
    throw new InitDataError('В initData нет данных пользователя');
  }
  const user = JSON.parse(rawUser) as TelegramInitDataUser;
  if (typeof user.id !== 'number' || typeof user.first_name !== 'string') {
    throw new InitDataError('Некорректные данные пользователя');
  }

  return { user, authDate };
}
