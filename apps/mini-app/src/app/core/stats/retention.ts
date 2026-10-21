import { DAY_MS, startOfLocalDay } from '@memo/shared/spaced-repetition';
import {
  DailyReviewPoint,
  RetentionPoint,
  RetentionSegment,
} from '../models/interfaces';

/** Базовая «устойчивость» памяти в днях для иллюстративной кривой забывания. */
export const BASE_STABILITY_DAYS = 8;
/** Во сколько раз растёт устойчивость после каждого повторения. */
export const STABILITY_GROWTH = 1.8;
/** Дни повторений на графике интервального повторения. */
export const REVIEW_DAYS: readonly number[] = [1, 5, 12, 25, 45];
export const RETENTION_HORIZON_DAYS = 60;
export const ACTIVITY_DAYS = 14;

const CURVE_STEPS = 24;

/** Кривая забывания Эббингауза: доля запоминания (%) через `day` дней. */
export function retention(day: number, stability: number): number {
  return Math.exp(-day / stability) * 100;
}

/** Кривая забывания без повторений на горизонте `horizon` дней. */
export function forgettingCurve(
  horizon: number = RETENTION_HORIZON_DAYS,
  stability: number = BASE_STABILITY_DAYS
): readonly RetentionPoint[] {
  return Array.from({ length: CURVE_STEPS + 1 }, (_, step) => {
    const day = (horizon * step) / CURVE_STEPS;
    return { day, retention: retention(day, stability) };
  });
}

/**
 * Иллюстрация интервального повторения: после каждого повторения память
 * восстанавливается до 100 %, а устойчивость растёт в STABILITY_GROWTH раз.
 */
export function spacedRepetitionCurve(
  reviewDays: readonly number[] = REVIEW_DAYS,
  horizon: number = RETENTION_HORIZON_DAYS
): readonly RetentionSegment[] {
  const boundaries = [0, ...reviewDays, horizon];
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1];
    const stability = BASE_STABILITY_DAYS * Math.pow(STABILITY_GROWTH, index);
    const points = Array.from({ length: CURVE_STEPS + 1 }, (_, step) => {
      const day = start + ((end - start) * step) / CURVE_STEPS;
      return { day, retention: retention(day - start, stability) };
    });
    return { index, points };
  });
}

/** Количество повторений по дням за последние `days` дней, включая сегодня. */
export function dailyReviews(
  timestamps: readonly number[],
  now: number,
  days: number = ACTIVITY_DAYS
): readonly DailyReviewPoint[] {
  const today = startOfLocalDay(now);
  const counts = timestamps.reduce<ReadonlyMap<number, number>>((map, timestamp) => {
    const day = startOfLocalDay(timestamp);
    return new Map(map).set(day, (map.get(day) ?? 0) + 1);
  }, new Map());
  return Array.from({ length: days }, (_, index) => {
    const day = startOfLocalDay(today - (days - 1 - index) * DAY_MS);
    return { day, count: counts.get(day) ?? 0 };
  });
}
