import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import {
  ReviewGrade,
  SchedulingState,
  createInitialSchedulingState,
  startOfLocalDay,
} from '@memo/shared/spaced-repetition';
import { DEFAULT_SETTINGS, MemoRepository } from '../db/memo-repository.service';
import {
  AppSettings,
  Card,
  CardDraft,
  Deck,
  DeckDraft,
  DeckStats,
  ReviewLogEntry,
} from '../models/interfaces';
import { createId } from '../utils/id';

const LEARNED_INTERVAL_DAYS = 21;
const CLOCK_TICK_MS = 30 * 1000;

/**
 * Единое in-memory состояние приложения на сигналах.
 * Любая мутация сначала пишется в IndexedDB, затем обновляет сигналы.
 */
@Injectable({ providedIn: 'root' })
export class MemoStore {
  private readonly repository = inject(MemoRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly decksState = signal<readonly Deck[]>([]);
  private readonly cardsState = signal<readonly Card[]>([]);
  private readonly settingsState = signal<AppSettings>(DEFAULT_SETTINGS);
  private readonly todayLogState = signal<readonly ReviewLogEntry[]>([]);
  private readonly loadedState = signal(false);
  private readonly nowState = signal(Date.now());
  private clockStarted = false;

  readonly decks = computed(() =>
    [...this.decksState()].sort((a, b) => b.updatedAt - a.updatedAt)
  );
  readonly cards = this.cardsState.asReadonly();
  readonly settings = this.settingsState.asReadonly();
  readonly isLoaded = this.loadedState.asReadonly();
  /** «Текущее время», обновляется раз в 30 секунд, чтобы пересчитывать очереди. */
  readonly now = this.nowState.asReadonly();
  readonly todayLog = this.todayLogState.asReadonly();

  readonly cardsByDeck = computed(() => {
    const map = new Map<string, readonly Card[]>();
    this.cardsState().forEach((card) => {
      map.set(card.deckId, [...(map.get(card.deckId) ?? []), card]);
    });
    return map;
  });

  readonly deckStats = computed(() => {
    const now = this.nowState();
    const map = new Map<string, DeckStats>();
    this.decksState().forEach((deck) => {
      const cards = this.cardsByDeck().get(deck.id) ?? [];
      map.set(deck.id, computeDeckStats(deck.id, cards, now));
    });
    return map;
  });

  /** Сколько новых карточек уже было показано сегодня (для дневного лимита). */
  readonly newCardsIntroducedToday = computed(() => {
    const ids = this.todayLogState()
      .filter((entry) => entry.stateBefore === 'new')
      .map((entry) => entry.cardId);
    return new Set(ids).size;
  });

  readonly reviewsToday = computed(() => this.todayLogState().length);

  async load(): Promise<void> {
    const [decks, cards, settings, todayLog] = await Promise.all([
      this.repository.getAllDecks(),
      this.repository.getAllCards(),
      this.repository.getSettings(),
      this.repository.getReviewLogSince(startOfLocalDay(Date.now())),
    ]);
    this.decksState.set(decks);
    this.cardsState.set(cards);
    this.settingsState.set(settings);
    this.todayLogState.set(todayLog);
    this.loadedState.set(true);
    this.startClock();
  }

  getDeckById(deckId: string): Deck | null {
    return this.decksState().find((deck) => deck.id === deckId) ?? null;
  }

  getCardById(cardId: string): Card | null {
    return this.cardsState().find((card) => card.id === cardId) ?? null;
  }

  getDeckStats(deckId: string): DeckStats {
    return (
      this.deckStats().get(deckId) ?? computeDeckStats(deckId, [], this.nowState())
    );
  }

  async createDeck(draft: DeckDraft, libraryId: string | null = null): Promise<Deck> {
    const now = Date.now();
    const deck: Deck = {
      id: createId(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      emoji: draft.emoji,
      isActive: true,
      libraryId,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.putDeck(deck);
    this.decksState.update((decks) => [...decks, deck]);
    return deck;
  }

  async updateDeck(deckId: string, draft: DeckDraft): Promise<void> {
    const existing = this.getDeckById(deckId);
    if (!existing) {
      return;
    }
    const updated: Deck = {
      ...existing,
      title: draft.title.trim(),
      description: draft.description.trim(),
      emoji: draft.emoji,
      updatedAt: Date.now(),
    };
    await this.repository.putDeck(updated);
    this.replaceDeck(updated);
  }

  async setDeckActive(deckId: string, isActive: boolean): Promise<void> {
    const existing = this.getDeckById(deckId);
    if (!existing) {
      return;
    }
    const updated: Deck = { ...existing, isActive, updatedAt: Date.now() };
    await this.repository.putDeck(updated);
    this.replaceDeck(updated);
  }

  async deleteDeck(deckId: string): Promise<void> {
    await this.repository.deleteDeckCascade(deckId);
    this.decksState.update((decks) => decks.filter((deck) => deck.id !== deckId));
    this.cardsState.update((cards) => cards.filter((card) => card.deckId !== deckId));
    this.todayLogState.update((log) => log.filter((entry) => entry.deckId !== deckId));
  }

  async createCard(deckId: string, draft: CardDraft): Promise<Card> {
    const now = Date.now();
    const card: Card = {
      id: createId(),
      deckId,
      question: draft.question.trim(),
      answer: draft.answer.trim(),
      imageId: draft.imageId,
      thumbnailDataUrl: draft.thumbnailDataUrl,
      scheduling: createInitialSchedulingState(now),
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.putCard(card);
    this.cardsState.update((cards) => [...cards, card]);
    await this.touchDeck(deckId);
    return card;
  }

  /** Массовое добавление карточек (импорт из библиотеки). */
  async createCards(deckId: string, drafts: readonly CardDraft[]): Promise<readonly Card[]> {
    const now = Date.now();
    const cards: readonly Card[] = drafts.map((draft, index) => ({
      id: createId(),
      deckId,
      question: draft.question.trim(),
      answer: draft.answer.trim(),
      imageId: draft.imageId,
      thumbnailDataUrl: draft.thumbnailDataUrl,
      scheduling: createInitialSchedulingState(now),
      // Небольшой сдвиг, чтобы сохранить порядок карточек при сортировке.
      createdAt: now + index,
      updatedAt: now + index,
    }));
    await this.repository.putCards(cards);
    this.cardsState.update((existing) => [...existing, ...cards]);
    await this.touchDeck(deckId);
    return cards;
  }

  async updateCard(cardId: string, draft: CardDraft): Promise<void> {
    const existing = this.getCardById(cardId);
    if (!existing) {
      return;
    }
    const updated: Card = {
      ...existing,
      question: draft.question.trim(),
      answer: draft.answer.trim(),
      imageId: draft.imageId,
      thumbnailDataUrl: draft.thumbnailDataUrl,
      updatedAt: Date.now(),
    };
    await this.repository.putCard(updated);
    if (existing.imageId && existing.imageId !== updated.imageId) {
      await this.repository.deleteImage(existing.imageId);
    }
    this.replaceCard(updated);
  }

  async deleteCard(cardId: string): Promise<void> {
    const existing = this.getCardById(cardId);
    if (!existing) {
      return;
    }
    await this.repository.deleteCard(cardId, existing.imageId);
    this.cardsState.update((cards) => cards.filter((card) => card.id !== cardId));
    this.todayLogState.update((log) => log.filter((entry) => entry.cardId !== cardId));
  }

  async resetCardProgress(cardId: string): Promise<void> {
    const existing = this.getCardById(cardId);
    if (!existing) {
      return;
    }
    const updated: Card = {
      ...existing,
      scheduling: createInitialSchedulingState(Date.now()),
      updatedAt: Date.now(),
    };
    await Promise.all([
      this.repository.putCard(updated),
      this.repository.deleteReviewLogForCard(cardId),
    ]);
    this.replaceCard(updated);
    this.todayLogState.update((log) => log.filter((entry) => entry.cardId !== cardId));
  }

  /** Сохраняет результат ответа: новое расписание карточки + запись в журнал. */
  async applyReview(
    card: Card,
    nextScheduling: SchedulingState,
    grade: ReviewGrade,
    reviewedAt: number
  ): Promise<Card> {
    const updated: Card = { ...card, scheduling: nextScheduling, updatedAt: reviewedAt };
    const entry: ReviewLogEntry = {
      id: createId(),
      cardId: card.id,
      deckId: card.deckId,
      grade,
      reviewedAt,
      stateBefore: card.scheduling.state,
      stateAfter: nextScheduling.state,
    };
    await Promise.all([
      this.repository.putCard(updated),
      this.repository.addReviewLog(entry),
    ]);
    this.replaceCard(updated);
    this.todayLogState.update((log) => [...log, entry]);
    return updated;
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<void> {
    const updated: AppSettings = { ...this.settingsState(), ...patch };
    await this.repository.putSettings(updated);
    this.settingsState.set(updated);
  }

  /** Перечитать всё из базы (после восстановления из резервной копии). */
  async reload(): Promise<void> {
    await this.load();
  }

  refreshNow(): void {
    this.nowState.set(Date.now());
  }

  private async touchDeck(deckId: string): Promise<void> {
    const existing = this.getDeckById(deckId);
    if (!existing) {
      return;
    }
    const updated: Deck = { ...existing, updatedAt: Date.now() };
    await this.repository.putDeck(updated);
    this.replaceDeck(updated);
  }

  private replaceDeck(updated: Deck): void {
    this.decksState.update((decks) =>
      decks.map((deck) => (deck.id === updated.id ? updated : deck))
    );
  }

  private replaceCard(updated: Card): void {
    this.cardsState.update((cards) =>
      cards.map((card) => (card.id === updated.id ? updated : card))
    );
  }

  private startClock(): void {
    if (this.clockStarted) {
      return;
    }
    this.clockStarted = true;
    const timer = setInterval(() => this.refreshNow(), CLOCK_TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}

export function computeDeckStats(
  deckId: string,
  cards: readonly Card[],
  now: number
): DeckStats {
  return cards.reduce<DeckStats>(
    (stats, card) => {
      const { state, dueAt, intervalDays } = card.scheduling;
      const isLearning = state === 'learning' || state === 'relearning';
      const isDueNow = state !== 'new' && dueAt <= now;
      const isLearned = state === 'review' && intervalDays >= LEARNED_INTERVAL_DAYS;
      return {
        ...stats,
        total: stats.total + 1,
        newCount: stats.newCount + (state === 'new' ? 1 : 0),
        learningCount: stats.learningCount + (isLearning ? 1 : 0),
        dueCount: stats.dueCount + (isDueNow ? 1 : 0),
        learnedCount: stats.learnedCount + (isLearned ? 1 : 0),
      };
    },
    { deckId, total: 0, newCount: 0, learningCount: 0, dueCount: 0, learnedCount: 0 }
  );
}
