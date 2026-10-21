import { createInitialSchedulingState } from '@memo/shared/spaced-repetition';
import { DEFAULT_SETTINGS } from '../db/memo-repository.service';
import {
  Card,
  Deck,
  LocalSnapshot,
  OutboxEntry,
  OutboxRecord,
  ReviewLogEntry,
} from '../models/interfaces';
import {
  EMPTY_PUSH_PAYLOAD,
  buildPushPlan,
  isPayloadEmpty,
  needsSnapshot,
  splitPushPayload,
} from './push-plan';

function deck(id: string, updatedAt = 1000): Deck {
  return {
    id,
    title: `Колода ${id}`,
    description: '',
    emoji: '📚',
    isActive: true,
    libraryId: null,
    createdAt: 1,
    updatedAt,
  };
}

function card(id: string, deckId: string, imageId: string | null = null): Card {
  return {
    id,
    deckId,
    question: `Вопрос ${id}`,
    answer: `Ответ ${id}`,
    imageId,
    thumbnailDataUrl: null,
    scheduling: createInitialSchedulingState(1),
    createdAt: 1,
    updatedAt: 1000,
  };
}

function review(id: string, cardId: string, deckId: string): ReviewLogEntry {
  return {
    id,
    cardId,
    deckId,
    grade: 'good',
    reviewedAt: 1000,
    stateBefore: 'new',
    stateAfter: 'learning',
  };
}

function records(entries: readonly OutboxEntry[]): readonly OutboxRecord[] {
  return entries.map((entry, index) => ({ seq: index + 1, entry, createdAt: index }));
}

describe('buildPushPlan', () => {
  it('пустая очередь даёт пустой план', () => {
    const plan = buildPushPlan([], null);
    expect(plan.isEmpty).toBe(true);
    expect(plan.maxSeq).toBe(0);
    expect(isPayloadEmpty(plan.payload)).toBe(true);
  });

  it('удаление карточки отменяет её более раннюю вставку и оставляет tombstone', () => {
    const plan = buildPushPlan(
      records([
        { kind: 'upsert-cards', cards: [card('c1', 'd1', 'img1')] },
        { kind: 'add-review', entry: review('r1', 'c1', 'd1') },
        { kind: 'delete-card', cardId: 'c1', imageId: 'img1', deletedAt: 2000 },
      ]),
      null
    );
    expect(plan.payload.cards).toEqual([]);
    expect(plan.payload.reviews).toEqual([]);
    expect(plan.payload.deletedCards).toEqual([{ id: 'c1', deletedAt: 2000 }]);
    expect(plan.images).toEqual([{ kind: 'remove', imageId: 'img1' }]);
    expect(plan.maxSeq).toBe(3);
  });

  it('повторная вставка после удаления снимает tombstone', () => {
    const plan = buildPushPlan(
      records([
        { kind: 'delete-card', cardId: 'c1', imageId: null, deletedAt: 2000 },
        { kind: 'upsert-cards', cards: [card('c1', 'd1')] },
      ]),
      null
    );
    expect(plan.payload.deletedCards).toEqual([]);
    expect(plan.payload.cards.map((item) => item.id)).toEqual(['c1']);
  });

  it('удаление колоды убирает её карточки и журнал из пакета и помечает изображения', () => {
    const plan = buildPushPlan(
      records([
        { kind: 'upsert-deck', deck: deck('d1') },
        { kind: 'upsert-cards', cards: [card('c1', 'd1', 'img1'), card('c2', 'd2')] },
        { kind: 'add-review', entry: review('r1', 'c1', 'd1') },
        { kind: 'add-review', entry: review('r2', 'c2', 'd2') },
        { kind: 'delete-deck', deckId: 'd1', imageIds: ['img1'], deletedAt: 3000 },
      ]),
      null
    );
    expect(plan.payload.decks).toEqual([]);
    expect(plan.payload.deletedDecks).toEqual([{ id: 'd1', deletedAt: 3000 }]);
    expect(plan.payload.cards.map((item) => item.id)).toEqual(['c2']);
    expect(plan.payload.reviews.map((item) => item.id)).toEqual(['r2']);
    expect(plan.images).toEqual([{ kind: 'remove', imageId: 'img1' }]);
  });

  it('сброс прогресса убирает накопленные ответы карточки, но сохраняет более поздние', () => {
    const plan = buildPushPlan(
      records([
        { kind: 'add-review', entry: review('r1', 'c1', 'd1') },
        { kind: 'clear-reviews', cardId: 'c1' },
        { kind: 'add-review', entry: review('r2', 'c1', 'd1') },
      ]),
      null
    );
    expect(plan.payload.clearedReviewCardIds).toEqual(['c1']);
    expect(plan.payload.reviews.map((item) => item.id)).toEqual(['r2']);
  });

  it('повторные изменения одной сущности схлопываются, последнее побеждает', () => {
    const plan = buildPushPlan(
      records([
        { kind: 'upsert-deck', deck: deck('d1', 1000) },
        { kind: 'upsert-deck', deck: deck('d1', 2000) },
        { kind: 'settings', settings: DEFAULT_SETTINGS, updatedAt: 10 },
        { kind: 'settings', settings: { ...DEFAULT_SETTINGS, autoSpeak: true }, updatedAt: 20 },
        { kind: 'upsert-image', imageId: 'img1' },
        { kind: 'delete-image', imageId: 'img1' },
      ]),
      null
    );
    expect(plan.payload.decks).toHaveLength(1);
    expect(plan.payload.decks[0].updatedAt).toBe(2000);
    expect(plan.payload.settings).toEqual({
      value: { ...DEFAULT_SETTINGS, autoSpeak: true },
      updatedAt: 20,
    });
    expect(plan.images).toEqual([{ kind: 'remove', imageId: 'img1' }]);
  });

  it('снимок базы заменяет накопленные вставки, но сохраняет удаления', () => {
    const snapshot: LocalSnapshot = {
      decks: [deck('d1')],
      cards: [card('c1', 'd1', 'img1')],
      imageIds: ['img1'],
      reviewLog: [review('r1', 'c1', 'd1')],
      settings: DEFAULT_SETTINGS,
      settingsUpdatedAt: 500,
    };
    const queue = records([
      { kind: 'upsert-cards', cards: [card('old', 'd1')] },
      { kind: 'snapshot' },
      { kind: 'delete-card', cardId: 'gone', imageId: 'img-gone', deletedAt: 900 },
    ]);
    expect(needsSnapshot(queue)).toBe(true);

    const plan = buildPushPlan(queue, snapshot);
    expect(plan.payload.replaceAll).toBe(false);
    expect(plan.payload.cards.map((item) => item.id)).toEqual(['c1']);
    expect(plan.payload.reviews.map((item) => item.id)).toEqual(['r1']);
    expect(plan.payload.deletedCards).toEqual([{ id: 'gone', deletedAt: 900 }]);
    expect(plan.payload.settings).toEqual({ value: DEFAULT_SETTINGS, updatedAt: 500 });
    expect(plan.images).toEqual([
      { kind: 'remove', imageId: 'img-gone' },
      { kind: 'upload', imageId: 'img1' },
    ]);
  });

  it('restore выставляет replaceAll', () => {
    const snapshot: LocalSnapshot = {
      decks: [],
      cards: [],
      imageIds: [],
      reviewLog: [],
      settings: DEFAULT_SETTINGS,
      settingsUpdatedAt: 0,
    };
    const plan = buildPushPlan(records([{ kind: 'replace-all' }]), snapshot);
    expect(plan.payload.replaceAll).toBe(true);
    expect(plan.payload.settings).toBeNull();
    expect(isPayloadEmpty(plan.payload)).toBe(false);
  });
});

describe('splitPushPayload', () => {
  it('первый пакет несёт флаги и удаления, карточки идут раньше журнала', () => {
    const cards = Array.from({ length: 5 }, (_, index) => card(`c${index}`, 'd1'));
    const reviews = Array.from({ length: 3 }, (_, index) => review(`r${index}`, 'c0', 'd1'));
    const chunks = splitPushPayload(
      {
        ...EMPTY_PUSH_PAYLOAD,
        replaceAll: true,
        deletedDecks: [{ id: 'x', deletedAt: 1 }],
        decks: [deck('d1')],
        cards,
        reviews,
      },
      2,
      2
    );

    expect(chunks).toHaveLength(5);
    expect(chunks[0].replaceAll).toBe(true);
    expect(chunks[0].deletedDecks).toHaveLength(1);
    expect(chunks[0].decks).toHaveLength(1);
    expect(chunks[0].cards).toHaveLength(2);
    expect(chunks[0].reviews).toHaveLength(0);
    expect(chunks.slice(1).every((chunk) => !chunk.replaceAll && chunk.decks.length === 0)).toBe(true);
    expect(chunks[1].cards).toHaveLength(2);
    expect(chunks[2].cards).toHaveLength(1);
    expect(chunks[3].reviews).toHaveLength(2);
    expect(chunks[4].reviews).toHaveLength(1);
  });

  it('пустой пакет остаётся одним (пустым) вызовом', () => {
    const chunks = splitPushPayload(EMPTY_PUSH_PAYLOAD);
    expect(chunks).toHaveLength(1);
    expect(isPayloadEmpty(chunks[0])).toBe(true);
  });
});
