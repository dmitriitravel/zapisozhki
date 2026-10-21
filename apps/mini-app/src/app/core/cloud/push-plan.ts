import {
  Card,
  Deck,
  LocalSnapshot,
  OutboxEntry,
  OutboxRecord,
  ReviewLogEntry,
} from '../models/interfaces';
import {
  DeletionMark,
  ImageOperation,
  ImageOperationKind,
  PushPlan,
  RemoteSettings,
  SyncPushPayload,
} from './interfaces';

/** Карточек в одном вызове sync_push (с превью ~5–10 КБ каждая). */
export const CARDS_PER_PUSH = 150;
/** Записей журнала в одном вызове sync_push. */
export const REVIEWS_PER_PUSH = 1000;

interface PlanAccumulator {
  readonly decks: ReadonlyMap<string, Deck>;
  readonly cards: ReadonlyMap<string, Card>;
  readonly deletedDecks: ReadonlyMap<string, number>;
  readonly deletedCards: ReadonlyMap<string, number>;
  readonly clearedReviewCardIds: ReadonlySet<string>;
  readonly reviews: ReadonlyMap<string, ReviewLogEntry>;
  readonly images: ReadonlyMap<string, ImageOperationKind>;
  readonly settings: RemoteSettings | null;
  readonly snapshot: boolean;
  readonly replaceAll: boolean;
}

const EMPTY_ACCUMULATOR: PlanAccumulator = {
  decks: new Map(),
  cards: new Map(),
  deletedDecks: new Map(),
  deletedCards: new Map(),
  clearedReviewCardIds: new Set(),
  reviews: new Map(),
  images: new Map(),
  settings: null,
  snapshot: false,
  replaceAll: false,
};

export const EMPTY_PUSH_PAYLOAD: SyncPushPayload = {
  replaceAll: false,
  deletedDecks: [],
  deletedCards: [],
  clearedReviewCardIds: [],
  decks: [],
  cards: [],
  reviews: [],
  settings: null,
};

function withEntry<K, V>(map: ReadonlyMap<K, V>, key: K, value: V): ReadonlyMap<K, V> {
  return new Map([...map, [key, value]]);
}

function withEntries<K, V>(
  map: ReadonlyMap<K, V>,
  entries: readonly (readonly [K, V])[]
): ReadonlyMap<K, V> {
  return new Map([...map, ...entries]);
}

function withoutKey<K, V>(map: ReadonlyMap<K, V>, key: K): ReadonlyMap<K, V> {
  return new Map([...map].filter(([existing]) => existing !== key));
}

function withoutKeys<K, V>(map: ReadonlyMap<K, V>, keys: readonly K[]): ReadonlyMap<K, V> {
  const excluded = new Set(keys);
  return new Map([...map].filter(([existing]) => !excluded.has(existing)));
}

function withoutValues<K, V>(
  map: ReadonlyMap<K, V>,
  predicate: (value: V) => boolean
): ReadonlyMap<K, V> {
  return new Map([...map].filter(([, value]) => !predicate(value)));
}

/** Нужен ли полный снимок локальной базы, чтобы собрать план отправки. */
export function needsSnapshot(records: readonly OutboxRecord[]): boolean {
  return records.some(
    ({ entry }) => entry.kind === 'snapshot' || entry.kind === 'replace-all'
  );
}

function applyEntry(acc: PlanAccumulator, entry: OutboxEntry): PlanAccumulator {
  switch (entry.kind) {
    case 'upsert-deck':
      return {
        ...acc,
        decks: withEntry(acc.decks, entry.deck.id, entry.deck),
        deletedDecks: withoutKey(acc.deletedDecks, entry.deck.id),
      };
    case 'upsert-cards':
      return {
        ...acc,
        cards: withEntries(
          acc.cards,
          entry.cards.map((card) => [card.id, card] as const)
        ),
        deletedCards: withoutKeys(
          acc.deletedCards,
          entry.cards.map((card) => card.id)
        ),
      };
    case 'delete-deck':
      return {
        ...acc,
        decks: withoutKey(acc.decks, entry.deckId),
        cards: withoutValues(acc.cards, (card) => card.deckId === entry.deckId),
        reviews: withoutValues(acc.reviews, (review) => review.deckId === entry.deckId),
        deletedDecks: withEntry(acc.deletedDecks, entry.deckId, entry.deletedAt),
        images: withEntries(
          acc.images,
          entry.imageIds.map((imageId) => [imageId, 'remove'] as const)
        ),
      };
    case 'delete-card':
      return {
        ...acc,
        cards: withoutKey(acc.cards, entry.cardId),
        reviews: withoutValues(acc.reviews, (review) => review.cardId === entry.cardId),
        deletedCards: withEntry(acc.deletedCards, entry.cardId, entry.deletedAt),
        images: entry.imageId
          ? withEntry(acc.images, entry.imageId, 'remove')
          : acc.images,
      };
    case 'upsert-image':
      return { ...acc, images: withEntry(acc.images, entry.imageId, 'upload') };
    case 'delete-image':
      return { ...acc, images: withEntry(acc.images, entry.imageId, 'remove') };
    case 'add-review':
      return { ...acc, reviews: withEntry(acc.reviews, entry.entry.id, entry.entry) };
    case 'clear-reviews':
      return {
        ...acc,
        clearedReviewCardIds: new Set([...acc.clearedReviewCardIds, entry.cardId]),
        reviews: withoutValues(acc.reviews, (review) => review.cardId === entry.cardId),
      };
    case 'settings':
      return {
        ...acc,
        settings: { value: entry.settings, updatedAt: entry.updatedAt },
      };
    case 'snapshot':
      return { ...acc, snapshot: true };
    case 'replace-all':
      return { ...acc, snapshot: true, replaceAll: true };
  }
}

/** Накладывает полный снимок базы поверх свёрнутой очереди (снимок читается в момент отправки). */
function applySnapshot(acc: PlanAccumulator, snapshot: LocalSnapshot): PlanAccumulator {
  const removes = [...acc.images].filter(([, kind]) => kind === 'remove');
  const uploads = snapshot.imageIds.map((imageId) => [imageId, 'upload'] as const);
  return {
    ...acc,
    decks: new Map(snapshot.decks.map((deck) => [deck.id, deck])),
    cards: new Map(snapshot.cards.map((card) => [card.id, card])),
    reviews: new Map(snapshot.reviewLog.map((entry) => [entry.id, entry])),
    images: new Map([...removes, ...uploads]),
    settings:
      snapshot.settingsUpdatedAt > 0
        ? { value: snapshot.settings, updatedAt: snapshot.settingsUpdatedAt }
        : acc.settings,
  };
}

function toMarks(map: ReadonlyMap<string, number>): readonly DeletionMark[] {
  return [...map].map(([id, deletedAt]) => ({ id, deletedAt }));
}

/**
 * Сворачивает очередь outbox в один план отправки: повторные изменения одной сущности
 * схлопываются, удаления отменяют более ранние вставки, порядок операций сохраняется
 * семантически (сервер применяет удаления до вставок).
 */
export function buildPushPlan(
  records: readonly OutboxRecord[],
  snapshot: LocalSnapshot | null
): PushPlan {
  const folded = records.reduce<PlanAccumulator>(
    (acc, record) => applyEntry(acc, record.entry),
    EMPTY_ACCUMULATOR
  );
  const acc = folded.snapshot && snapshot ? applySnapshot(folded, snapshot) : folded;

  const images: readonly ImageOperation[] = [...acc.images].map(([imageId, kind]) => ({
    kind,
    imageId,
  }));
  const payload: SyncPushPayload = {
    replaceAll: acc.replaceAll,
    deletedDecks: toMarks(acc.deletedDecks),
    deletedCards: toMarks(acc.deletedCards),
    clearedReviewCardIds: [...acc.clearedReviewCardIds],
    decks: [...acc.decks.values()],
    cards: [...acc.cards.values()],
    reviews: [...acc.reviews.values()],
    settings: acc.settings,
  };
  return {
    payload,
    images,
    maxSeq: records.length === 0 ? 0 : records[records.length - 1].seq,
    isEmpty: records.length === 0,
  };
}

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size)
  );
}

/**
 * Делит большой пакет на несколько вызовов sync_push. Первый вызов несёт очистку,
 * tombstone, колоды и настройки; карточки идут раньше журнала (журнал ссылается на них).
 */
export function splitPushPayload(
  payload: SyncPushPayload,
  cardsPerPush: number = CARDS_PER_PUSH,
  reviewsPerPush: number = REVIEWS_PER_PUSH
): readonly SyncPushPayload[] {
  const cardChunks = chunk(payload.cards, cardsPerPush);
  const reviewChunks = chunk(payload.reviews, reviewsPerPush);
  const [firstCards = [], ...restCards] = cardChunks;

  const head: SyncPushPayload = { ...payload, cards: firstCards, reviews: [] };
  const cardTail: readonly SyncPushPayload[] = restCards.map((cards) => ({
    ...EMPTY_PUSH_PAYLOAD,
    cards,
  }));
  const reviewTail: readonly SyncPushPayload[] = reviewChunks.map((reviews) => ({
    ...EMPTY_PUSH_PAYLOAD,
    reviews,
  }));
  return [head, ...cardTail, ...reviewTail];
}

/** Есть ли в пакете хоть что-то, что нужно отправить. */
export function isPayloadEmpty(payload: SyncPushPayload): boolean {
  return (
    !payload.replaceAll &&
    payload.deletedDecks.length === 0 &&
    payload.deletedCards.length === 0 &&
    payload.clearedReviewCardIds.length === 0 &&
    payload.decks.length === 0 &&
    payload.cards.length === 0 &&
    payload.reviews.length === 0 &&
    payload.settings === null
  );
}
