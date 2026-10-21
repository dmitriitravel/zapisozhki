import { DAY_MS, startOfLocalDay } from '@memo/shared/spaced-repetition';
import {
  BASE_STABILITY_DAYS,
  REVIEW_DAYS,
  dailyReviews,
  forgettingCurve,
  retention,
  spacedRepetitionCurve,
} from './retention';

describe('retention', () => {
  it('в день 0 память равна 100 % и убывает экспоненциально', () => {
    expect(retention(0, BASE_STABILITY_DAYS)).toBe(100);
    expect(retention(BASE_STABILITY_DAYS, BASE_STABILITY_DAYS)).toBeCloseTo(36.79, 1);
    expect(retention(5, BASE_STABILITY_DAYS)).toBeGreaterThan(50);
  });
});

describe('forgettingCurve', () => {
  it('строит монотонно убывающую кривую от 0 до горизонта', () => {
    const curve = forgettingCurve(60);
    expect(curve[0]).toEqual({ day: 0, retention: 100 });
    expect(curve[curve.length - 1].day).toBe(60);
    curve.slice(1).forEach((point, index) => {
      expect(point.retention).toBeLessThan(curve[index].retention);
    });
  });
});

describe('spacedRepetitionCurve', () => {
  it('создаёт по сегменту на каждый интервал между повторениями', () => {
    const segments = spacedRepetitionCurve(REVIEW_DAYS, 60);
    expect(segments).toHaveLength(REVIEW_DAYS.length + 1);
    segments.forEach((segment, index) => {
      expect(segment.index).toBe(index);
      // После каждого повторения память снова 100 %.
      expect(segment.points[0].retention).toBe(100);
    });
    expect(segments[1].points[0].day).toBe(REVIEW_DAYS[0]);
  });

  it('с каждым повторением забывание замедляется', () => {
    const segments = spacedRepetitionCurve([5, 15, 30], 60);
    const dropAfterDays = (index: number, days: number): number => {
      const start = segments[index].points[0].day;
      const point = segments[index].points.find((p) => p.day >= start + days);
      return point ? 100 - point.retention : 0;
    };
    expect(dropAfterDays(0, 3)).toBeGreaterThan(0);
    expect(dropAfterDays(1, 3)).toBeLessThan(dropAfterDays(0, 3));
    expect(dropAfterDays(2, 3)).toBeLessThan(dropAfterDays(1, 3));
  });
});

describe('dailyReviews', () => {
  it('считает повторения по дням за указанный период, включая сегодня', () => {
    const now = new Date(2026, 9, 21, 15, 0).getTime();
    const today = startOfLocalDay(now);
    const log = [
      now,
      now - 60 * 60 * 1000,
      today - DAY_MS + 1000,
      today - 3 * DAY_MS + 5000,
      today - 20 * DAY_MS, // за пределами окна
    ];
    const points = dailyReviews(log, now, 7);
    expect(points).toHaveLength(7);
    expect(points[points.length - 1]).toEqual({ day: today, count: 2 });
    expect(points[points.length - 2].count).toBe(1);
    expect(points[points.length - 4].count).toBe(1);
    expect(points.reduce((sum, point) => sum + point.count, 0)).toBe(4);
  });
});
