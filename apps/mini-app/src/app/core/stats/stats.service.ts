import { Injectable, inject } from '@angular/core';
import { DAY_MS, startOfLocalDay } from '@memo/shared/spaced-repetition';
import { MemoRepository } from '../db/memo-repository.service';
import { StudyStats } from '../models/interfaces';
import { MemoStore } from '../store/memo-store.service';
import { dailyReviews } from './retention';

@Injectable({ providedIn: 'root' })
export class StatsService {
  private readonly repository = inject(MemoRepository);
  private readonly store = inject(MemoStore);

  async compute(): Promise<StudyStats> {
    const now = Date.now();
    const log = await this.repository.getAllReviewLog();
    const timestamps = log.map((entry) => entry.reviewedAt);
    const totals = Array.from(this.store.deckStats().values()).reduce(
      (acc, stats) => ({
        totalCards: acc.totalCards + stats.total,
        learnedCards: acc.learnedCards + stats.learnedCount,
        dueToday: acc.dueToday + stats.dueCount,
      }),
      { totalCards: 0, learnedCards: 0, dueToday: 0 }
    );
    return {
      ...totals,
      reviewedToday: this.store.reviewsToday(),
      streakDays: computeStreak(timestamps, now),
      dailyReviews: dailyReviews(timestamps, now),
    };
  }
}

/** Количество подряд идущих дней с повторениями, заканчивая сегодня или вчера. */
export function computeStreak(timestamps: readonly number[], now: number): number {
  const days = new Set(timestamps.map((timestamp) => startOfLocalDay(timestamp)));
  const today = startOfLocalDay(now);
  const start = days.has(today) ? today : today - DAY_MS;
  if (!days.has(start)) {
    return 0;
  }
  const count = (day: number, acc: number): number =>
    days.has(day) ? count(startOfLocalDay(day - DAY_MS), acc + 1) : acc;
  return count(start, 0);
}
