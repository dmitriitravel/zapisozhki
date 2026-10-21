import { Injectable, computed, inject, signal } from '@angular/core';
import { ReviewGrade } from '@memo/shared/spaced-repetition';
import { Card } from '../models/interfaces';
import { MemoStore } from '../store/memo-store.service';
import { formatCountdown } from '../utils/format';
import {
  EMPTY_SESSION_RESULT,
  SessionProgress,
  SessionResult,
  StudyMode,
  WaitingInfo,
} from './interfaces';
import { StudyService } from './study.service';

/**
 * Состояние экрана «Тренировка»: область (колода или Drilling list), режим Memo/Dremo,
 * очередь карточек и прогресс текущей сессии. Живёт на уровне приложения,
 * поэтому переключение вкладок не сбрасывает сессию.
 */
@Injectable({ providedIn: 'root' })
export class StudySession {
  private readonly store = inject(MemoStore);
  private readonly study = inject(StudyService);

  private readonly deckIdState = signal<string | null>(null);
  private readonly modeState = signal<StudyMode>('dremo');
  private readonly startedState = signal(false);
  private readonly flippedState = signal(false);
  private readonly resultState = signal<SessionResult>(EMPTY_SESSION_RESULT);
  private readonly tickState = signal(Date.now());
  private readonly memoIndexState = signal(0);
  private readonly queueIdsState = signal<readonly string[]>([]);
  /** Карточки, уже побывавшие «текущими» в этой сессии (для счётчика «N из M»). */
  private readonly shownIdsState = signal<readonly string[]>([]);
  private readonly initialCountState = signal(0);
  private readonly learnAheadState = signal(false);
  private readonly lastGradeState = signal<ReviewGrade | null>(null);

  readonly deckId = this.deckIdState.asReadonly();
  readonly mode = this.modeState.asReadonly();
  readonly isStarted = this.startedState.asReadonly();
  readonly isFlipped = this.flippedState.asReadonly();
  readonly result = this.resultState.asReadonly();
  readonly tick = this.tickState.asReadonly();
  readonly memoIndex = this.memoIndexState.asReadonly();
  readonly learnAhead = this.learnAheadState.asReadonly();
  readonly lastGrade = this.lastGradeState.asReadonly();

  readonly scopeDeck = computed(() => {
    const id = this.deckIdState();
    return id ? this.store.getDeckById(id) : null;
  });
  readonly scopeTitle = computed(() => this.scopeDeck()?.title ?? 'Drilling list');

  /** Карточки очереди в актуальном состоянии (из стора). */
  readonly queueCards = computed(() =>
    this.queueIdsState()
      .map((id) => this.store.getCardById(id))
      .filter((card): card is Card => card !== null)
  );

  /** Текущая карточка: первая, чьё время пришло, либо первая вообще в режиме «показать сейчас». */
  readonly current = computed<Card | null>(() => {
    const cards = this.queueCards();
    if (cards.length === 0) {
      return null;
    }
    if (this.learnAheadState()) {
      return cards[0];
    }
    const now = this.tickState();
    return cards.find((card) => card.scheduling.dueAt <= now) ?? null;
  });

  /** Следующая карточка в стопке (для визуального «хвоста»). */
  readonly next = computed<Card | null>(() => {
    const current = this.current();
    if (!current) {
      return null;
    }
    return this.queueCards().find((card) => card.id !== current.id) ?? null;
  });

  /** Ближайшая карточка, если сейчас показывать нечего (все на коротких шагах). */
  readonly waiting = computed<WaitingInfo | null>(() => {
    if (this.current() !== null) {
      return null;
    }
    const cards = this.queueCards();
    if (cards.length === 0) {
      return null;
    }
    const nearest = cards.reduce((min, card) =>
      card.scheduling.dueAt < min.scheduling.dueAt ? card : min
    );
    return {
      card: nearest,
      countdown: formatCountdown(nearest.scheduling.dueAt - this.tickState()),
    };
  });

  readonly isFinished = computed(
    () => this.startedState() && this.queueCards().length === 0
  );

  readonly progress = computed<SessionProgress>(() => {
    const remaining = this.queueCards().length;
    const shown = this.shownIdsState().length;
    const total = Math.max(this.initialCountState(), shown);
    const position = Math.min(total, Math.max(1, shown));
    return { position, remaining, total };
  });

  readonly summary = computed(() => this.study.summarize(this.queueCards()));

  readonly gradeOptions = computed(() => {
    const card = this.current();
    return card ? this.study.getGradeOptions(card, this.tickState()) : [];
  });

  /** Все карточки области (для «Повторить все» и вкладки «Все» в Drilling list). */
  readonly scopedCards = computed(() => this.study.buildFullQueue(this.deckIdState()));

  readonly memoCards = computed(() => this.study.memoCards(this.deckIdState()));

  readonly memoCurrent = computed<Card | null>(() => {
    const cards = this.memoCards();
    if (cards.length === 0) {
      return null;
    }
    return cards[Math.min(this.memoIndexState(), cards.length - 1)];
  });

  readonly memoPosition = computed(() => {
    const count = this.memoCards().length;
    return count === 0 ? 0 : Math.min(this.memoIndexState(), count - 1) + 1;
  });

  // Область и режим

  /** Меняет область; сессия перезапускается только если область действительно изменилась. */
  setScope(deckId: string | null): void {
    if (this.startedState() && this.deckIdState() === deckId) {
      return;
    }
    this.deckIdState.set(deckId);
    this.memoIndexState.set(0);
    this.start();
  }

  setMode(mode: StudyMode): void {
    if (this.modeState() === mode) {
      return;
    }
    this.modeState.set(mode);
    this.flippedState.set(false);
  }

  // Dremo

  /** Начать сессию с карточками «на сегодня». */
  start(): void {
    const queue = this.study.buildQueue(this.deckIdState(), Date.now());
    this.beginSession(
      queue.map((card) => card.id),
      false
    );
  }

  /** Начать сессию заново со всеми карточками области, даже если они не «к повторению». */
  startAll(): void {
    this.beginSession(
      this.scopedCards().map((card) => card.id),
      true
    );
  }

  flip(): void {
    if (this.flippedState() || this.current() === null) {
      return;
    }
    this.flippedState.set(true);
  }

  async rate(grade: ReviewGrade): Promise<Card | null> {
    const card = this.current();
    if (!card) {
      return null;
    }
    const now = Date.now();
    const updated = await this.study.rate(card, grade, now);
    const stillLearning =
      updated.scheduling.state === 'learning' ||
      updated.scheduling.state === 'relearning';
    this.queueIdsState.update((queue) => {
      const rest = queue.filter((id) => id !== card.id);
      return stillLearning ? [...rest, card.id] : rest;
    });
    this.resultState.update((result) => ({
      ...result,
      reviewed: result.reviewed + 1,
      [grade]: result[grade] + 1,
    }));
    this.lastGradeState.set(grade);
    this.flippedState.set(false);
    this.learnAheadState.set(false);
    this.tickState.set(now);
    this.markCurrentShown();
    return updated;
  }

  showNow(): void {
    this.learnAheadState.set(true);
    this.markCurrentShown();
  }

  /** Убирает карточку из очереди (после удаления). */
  removeFromQueue(cardId: string): void {
    this.queueIdsState.update((queue) => queue.filter((id) => id !== cardId));
    this.shownIdsState.update((shown) => shown.filter((id) => id !== cardId));
    this.initialCountState.update((count) => Math.max(0, count - 1));
    this.flippedState.set(false);
    this.markCurrentShown();
  }

  // Memo

  memoNext(): void {
    const count = this.memoCards().length;
    if (count === 0) {
      return;
    }
    this.memoIndexState.update((index) => (index + 1) % count);
  }

  memoPrevious(): void {
    const count = this.memoCards().length;
    if (count === 0) {
      return;
    }
    this.memoIndexState.update((index) => (index - 1 + count) % count);
  }

  /** Обновляет «сейчас» (раз в секунду, пока экран тренировки открыт). */
  tickNow(): void {
    this.tickState.set(Date.now());
  }

  private beginSession(ids: readonly string[], learnAhead: boolean): void {
    this.queueIdsState.set(ids);
    this.initialCountState.set(ids.length);
    this.shownIdsState.set([]);
    this.resultState.set(EMPTY_SESSION_RESULT);
    this.flippedState.set(false);
    this.learnAheadState.set(learnAhead);
    this.lastGradeState.set(null);
    this.tickState.set(Date.now());
    this.startedState.set(true);
    this.markCurrentShown();
  }

  private markCurrentShown(): void {
    const current = this.current();
    if (!current || this.shownIdsState().includes(current.id)) {
      return;
    }
    this.shownIdsState.update((shown) => [...shown, current.id]);
  }
}
