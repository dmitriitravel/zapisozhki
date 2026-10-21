import { Injectable, inject } from '@angular/core';
import {
  DAY_MS,
  ReviewGrade,
  previewSchedules,
  scheduleReview,
} from '@memo/shared/spaced-repetition';
import { Card } from '../models/interfaces';
import { MemoStore } from '../store/memo-store.service';
import { formatDelay } from '../utils/format';
import { CardStateLabel, GradeOption, StudyQueueSummary } from './interfaces';

const GRADE_LABELS: Readonly<Record<ReviewGrade, string>> = {
  again: 'Забыл',
  hard: 'Трудно',
  good: 'Помню',
  easy: 'Легко',
};

/** Формирует очередь повторения и применяет оценки через планировщик. */
@Injectable({ providedIn: 'root' })
export class StudyService {
  private readonly store = inject(MemoStore);

  /**
   * Карточки на сегодня: сначала короткие шаги заучивания, затем повторения,
   * затем новые карточки в рамках дневного лимита.
   * deckId === null — все активные колоды.
   */
  buildQueue(deckId: string | null, now: number): readonly Card[] {
    const cards = this.scopedCards(deckId);

    const learning = cards
      .filter(
        (card) =>
          (card.scheduling.state === 'learning' ||
            card.scheduling.state === 'relearning') &&
          card.scheduling.dueAt <= now
      )
      .sort(byDueAt);

    const review = cards
      .filter(
        (card) => card.scheduling.state === 'review' && card.scheduling.dueAt <= now
      )
      .sort(byDueAt);

    const newAllowance = Math.max(
      0,
      this.store.settings().newCardsPerDay - this.store.newCardsIntroducedToday()
    );
    const fresh = cards
      .filter((card) => card.scheduling.state === 'new')
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, newAllowance);

    return [...learning, ...review, ...fresh];
  }

  /** Все карточки области повторения: одна колода или все активные колоды. */
  scopedCards(deckId: string | null): readonly Card[] {
    const deckIds = new Set(
      this.store
        .decks()
        .filter((deck) => (deckId ? deck.id === deckId : deck.isActive))
        .map((deck) => deck.id)
    );
    return this.store.cards().filter((card) => deckIds.has(card.deckId));
  }

  /** «Повторить все карточки»: вся область, отсортированная по сроку — ближайшие первыми. */
  buildFullQueue(deckId: string | null): readonly Card[] {
    return [...this.scopedCards(deckId)].sort(byDueAt);
  }

  /** Карточки для режима Memo (просмотр без оценок) в порядке добавления. */
  memoCards(deckId: string | null): readonly Card[] {
    return [...this.scopedCards(deckId)].sort((a, b) => a.createdAt - b.createdAt);
  }

  describeState(card: Card, now: number): CardStateLabel {
    const { state, dueAt } = card.scheduling;
    if (state === 'new') {
      return { text: 'Новая', tone: 'info' };
    }
    if (state === 'learning' || state === 'relearning') {
      return dueAt <= now
        ? { text: 'Учится · сейчас', tone: 'warning' }
        : { text: `Учится · ${formatDelay(dueAt - now)}`, tone: 'warning' };
    }
    return dueAt <= now
      ? { text: 'К повторению', tone: 'accent' }
      : { text: `Через ${formatDelay(dueAt - now)}`, tone: 'muted' };
  }

  summarize(queue: readonly Card[]): StudyQueueSummary {
    return queue.reduce<StudyQueueSummary>(
      (summary, card) => {
        const state = card.scheduling.state;
        return {
          learningCount:
            summary.learningCount +
            (state === 'learning' || state === 'relearning' ? 1 : 0),
          reviewCount: summary.reviewCount + (state === 'review' ? 1 : 0),
          newCount: summary.newCount + (state === 'new' ? 1 : 0),
          total: summary.total + 1,
        };
      },
      { learningCount: 0, reviewCount: 0, newCount: 0, total: 0 }
    );
  }

  getGradeOptions(card: Card, now: number): readonly GradeOption[] {
    return previewSchedules(card.scheduling, now).map((preview) => ({
      grade: preview.grade,
      label: GRADE_LABELS[preview.grade],
      // Для review дата округляется к началу дня, поэтому показываем интервал в днях,
      // а не точную разницу во времени.
      delayLabel:
        preview.next.state === 'review'
          ? formatDelay(preview.next.intervalDays * DAY_MS)
          : formatDelay(preview.delayMs),
    }));
  }

  async rate(card: Card, grade: ReviewGrade, now: number): Promise<Card> {
    const next = scheduleReview(card.scheduling, grade, now);
    return this.store.applyReview(card, next, grade, now);
  }
}

function byDueAt(a: Card, b: Card): number {
  return a.scheduling.dueAt - b.scheduling.dueAt;
}
