import { DAY_MS, MINUTE_MS } from '@memo/shared/spaced-repetition';

const HOUR_MS = 60 * MINUTE_MS;

/** Короткое человекочитаемое представление интервала: «10 мин», «3 дн», «2 мес». */
export function formatDelay(delayMs: number): string {
  if (delayMs < MINUTE_MS) {
    return '<1 мин';
  }
  if (delayMs < HOUR_MS) {
    return `${Math.round(delayMs / MINUTE_MS)} мин`;
  }
  if (delayMs < DAY_MS) {
    return `${Math.round(delayMs / HOUR_MS)} ч`;
  }
  const days = Math.round(delayMs / DAY_MS);
  if (days < 30) {
    return `${days} дн`;
  }
  if (days < 365) {
    return `${Math.round(days / 30)} мес`;
  }
  return `${(days / 365).toFixed(1)} г`;
}

/** Обратный отсчёт в формате «м:сс». */
export function formatCountdown(delayMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(delayMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Склонение существительных: pluralize(5, ['карточка', 'карточки', 'карточек']). */
export function pluralize(
  count: number,
  forms: readonly [string, string, string]
): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) {
    return forms[2];
  }
  if (last > 1 && last < 5) {
    return forms[1];
  }
  if (last === 1) {
    return forms[0];
  }
  return forms[2];
}

export function formatCount(
  count: number,
  forms: readonly [string, string, string]
): string {
  return `${count} ${pluralize(count, forms)}`;
}

/** Инициалы для аватара: «Мария Иванова» → «МИ», «anna» → «A». */
export function formatInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0);
  if (parts.length === 0) {
    return '';
  }
  const letters = parts.length === 1 ? [parts[0]] : [parts[0], parts[parts.length - 1]];
  return letters.map((part) => Array.from(part)[0].toUpperCase()).join('');
}

/** Короткая подпись дня для графика активности: «пн», «вт»… */
export function formatWeekday(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', { weekday: 'short' })
    .format(new Date(timestamp))
    .replace('.', '');
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}
