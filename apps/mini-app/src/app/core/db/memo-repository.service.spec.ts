import 'fake-indexeddb/auto';
import { TestBed } from '@angular/core/testing';
import { createInitialSchedulingState } from '@memo/shared/spaced-repetition';
import { IDBFactory } from 'fake-indexeddb';
import {
  META_CLOUD_USER_ID,
  META_SETTINGS_UPDATED_AT,
  RemoteCard,
  RemoteDeck,
  SyncPullResponse,
} from '../cloud/interfaces';
import { Card, Deck, ReviewLogEntry, StoredImage } from '../models/interfaces';
import { DEFAULT_SETTINGS, MemoRepository } from './memo-repository.service';

function deck(id: string, updatedAt: number): Deck {
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

function card(id: string, deckId: string, updatedAt: number, imageId: string | null = null): Card {
  return {
    id,
    deckId,
    question: `Вопрос ${id}`,
    answer: `Ответ ${id}`,
    imageId,
    thumbnailDataUrl: null,
    scheduling: createInitialSchedulingState(1),
    createdAt: 1,
    updatedAt,
  };
}

function remoteDeck(id: string, updatedAt: number, deletedAt: number | null = null): RemoteDeck {
  return { ...deck(id, updatedAt), deletedAt };
}

function remoteCard(
  id: string,
  deckId: string,
  updatedAt: number,
  options: { readonly deletedAt?: number | null; readonly imageId?: string | null } = {}
): RemoteCard {
  return {
    ...card(id, deckId, updatedAt, options.imageId ?? null),
    deletedAt: options.deletedAt ?? null,
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

function image(id: string): StoredImage {
  return { id, dataUrl: 'data:image/jpeg;base64,AAAA', width: 1, height: 1, createdAt: 1 };
}

function batch(partial: Partial<SyncPullResponse>): SyncPullResponse {
  return {
    serverTime: 10_000,
    decks: [],
    cards: [],
    reviews: [],
    settings: null,
    ...partial,
  };
}

describe('MemoRepository', () => {
  let repository: MemoRepository;

  beforeEach(() => {
    // Свежая база на каждый тест.
    globalThis.indexedDB = new IDBFactory();
    TestBed.configureTestingModule({});
    repository = TestBed.inject(MemoRepository);
  });

  it('локальное изменение пишет данные и запись в outbox', async () => {
    const before = repository.outboxVersion();
    await repository.putDeck(deck('d1', 100));

    expect(await repository.getAllDecks()).toHaveLength(1);
    const outbox = await repository.getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0].entry).toEqual({ kind: 'upsert-deck', deck: deck('d1', 100) });
    expect(repository.outboxVersion()).toBe(before + 1);
  });

  it('удаление карточки убирает изображение и журнал и ставит tombstone в очередь', async () => {
    await repository.putDeck(deck('d1', 100));
    await repository.putImage(image('img1'));
    await repository.putCard(card('c1', 'd1', 100, 'img1'));
    await repository.addReviewLog(review('r1', 'c1', 'd1'));

    await repository.deleteCard('c1', 'img1');

    expect(await repository.getAllCards()).toHaveLength(0);
    expect(await repository.getImage('img1')).toBeNull();
    expect(await repository.getAllReviewLog()).toHaveLength(0);
    const last = (await repository.getOutbox()).at(-1)?.entry;
    expect(last).toMatchObject({ kind: 'delete-card', cardId: 'c1', imageId: 'img1' });
  });

  it('очередь очищается до указанного seq', async () => {
    await repository.putDeck(deck('d1', 100));
    await repository.putDeck(deck('d2', 100));
    const [first] = await repository.getOutbox();
    await repository.clearOutboxUpTo(first.seq);
    expect(await repository.countOutbox()).toBe(1);
  });

  describe('applyRemoteBatch', () => {
    it('добавляет новые колоды, карточки, журнал и настройки без записи в outbox', async () => {
      const result = await repository.applyRemoteBatch(
        batch({
          decks: [remoteDeck('d1', 100)],
          cards: [remoteCard('c1', 'd1', 100, { imageId: 'img1' })],
          reviews: [review('r1', 'c1', 'd1')],
          settings: { value: { autoSpeak: true }, updatedAt: 50 },
        })
      );

      expect(result.changed).toBe(true);
      expect(result.missingImageIds).toEqual(['img1']);
      expect(await repository.getAllDecks()).toHaveLength(1);
      expect(await repository.getAllCards()).toHaveLength(1);
      expect(await repository.getAllReviewLog()).toHaveLength(1);
      expect(await repository.getSettings()).toEqual({ ...DEFAULT_SETTINGS, autoSpeak: true });
      expect(await repository.getMeta(META_SETTINGS_UPDATED_AT)).toBe(50);
      expect(await repository.countOutbox()).toBe(0);
    });

    it('повторное применение того же пакета ничего не меняет', async () => {
      const payload = batch({
        decks: [remoteDeck('d1', 100)],
        cards: [remoteCard('c1', 'd1', 100)],
        reviews: [review('r1', 'c1', 'd1')],
        settings: { value: {}, updatedAt: 50 },
      });
      await repository.applyRemoteBatch(payload);
      const second = await repository.applyRemoteBatch(payload);
      expect(second.changed).toBe(false);
    });

    it('«последняя запись побеждает»: локальная версия новее — остаётся', async () => {
      await repository.putDeck(deck('d1', 200));
      await repository.applyRemoteBatch(batch({ decks: [remoteDeck('d1', 100)] }));
      expect((await repository.getAllDecks())[0].updatedAt).toBe(200);

      await repository.applyRemoteBatch(batch({ decks: [remoteDeck('d1', 300)] }));
      expect((await repository.getAllDecks())[0].updatedAt).toBe(300);
    });

    it('tombstone удаляет карточку вместе с изображением и журналом', async () => {
      await repository.putDeck(deck('d1', 100));
      await repository.putImage(image('img1'));
      await repository.putCard(card('c1', 'd1', 100, 'img1'));
      await repository.addReviewLog(review('r1', 'c1', 'd1'));

      const result = await repository.applyRemoteBatch(
        batch({ cards: [remoteCard('c1', 'd1', 150, { deletedAt: 150 })] })
      );

      expect(result.changed).toBe(true);
      expect(await repository.getAllCards()).toHaveLength(0);
      expect(await repository.getImage('img1')).toBeNull();
      expect(await repository.getAllReviewLog()).toHaveLength(0);
    });

    it('tombstone не трогает карточку, изменённую локально позже', async () => {
      await repository.putDeck(deck('d1', 100));
      await repository.putCard(card('c1', 'd1', 500));
      const result = await repository.applyRemoteBatch(
        batch({ cards: [remoteCard('c1', 'd1', 150, { deletedAt: 150 })] })
      );
      expect(result.changed).toBe(false);
      expect(await repository.getAllCards()).toHaveLength(1);
    });

    it('tombstone колоды удаляет её карточки каскадом', async () => {
      await repository.putDeck(deck('d1', 100));
      await repository.putCards([card('c1', 'd1', 100), card('c2', 'd1', 100)]);
      await repository.applyRemoteBatch(batch({ decks: [remoteDeck('d1', 200, 200)] }));
      expect(await repository.getAllDecks()).toHaveLength(0);
      expect(await repository.getAllCards()).toHaveLength(0);
    });

    it('карточка без известной колоды пропускается', async () => {
      const result = await repository.applyRemoteBatch(
        batch({ cards: [remoteCard('c1', 'missing', 100)] })
      );
      expect(result.changed).toBe(false);
      expect(await repository.getAllCards()).toHaveLength(0);
    });

    it('настройки из облака не перекрывают более новые локальные', async () => {
      await repository.putSettings({ ...DEFAULT_SETTINGS, newCardsPerDay: 5 });
      await repository.applyRemoteBatch(
        batch({ settings: { value: { newCardsPerDay: 50 }, updatedAt: 1 } })
      );
      expect((await repository.getSettings()).newCardsPerDay).toBe(5);
    });
  });

  it('снимок содержит всё содержимое базы и время настроек', async () => {
    await repository.putDeck(deck('d1', 100));
    await repository.putImage(image('img1'));
    await repository.putCard(card('c1', 'd1', 100, 'img1'));
    await repository.putSettings(DEFAULT_SETTINGS);

    const snapshot = await repository.getSnapshot();
    expect(snapshot.decks).toHaveLength(1);
    expect(snapshot.cards).toHaveLength(1);
    expect(snapshot.imageIds).toEqual(['img1']);
    expect(snapshot.settingsUpdatedAt).toBeGreaterThan(0);
  });

  it('clearAllLocal очищает данные, очередь и служебные значения', async () => {
    await repository.putDeck(deck('d1', 100));
    await repository.setMeta(META_CLOUD_USER_ID, 'user-1');
    await repository.clearAllLocal();

    expect(await repository.getAllDecks()).toHaveLength(0);
    expect(await repository.countOutbox()).toBe(0);
    expect(await repository.getMeta(META_CLOUD_USER_ID)).toBeNull();
  });
});
