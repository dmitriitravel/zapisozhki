import { Injectable, inject, signal } from '@angular/core';
import {
  META_CLOUD_USER_ID,
  META_LAST_PULL_AT,
  META_SETTINGS_UPDATED_AT,
  RemoteApplyResult,
  RemoteCard,
  RemoteDeck,
  SyncPullResponse,
} from '../cloud/interfaces';
import {
  AppSettings,
  BackupPayload,
  Card,
  Deck,
  LocalSnapshot,
  MetaRecord,
  OutboxEntry,
  OutboxRecord,
  ReviewLogEntry,
  StoredImage,
} from '../models/interfaces';
import { AppDatabase } from './app-database';

export const DEFAULT_SETTINGS: AppSettings = {
  newCardsPerDay: 20,
  hapticsEnabled: true,
  swipeToRate: true,
  autoSpeak: false,
  speechRate: 0.5,
  imageOnlyFront: true,
  userName: '',
};

/** Хранилище outbox внутри любой readwrite-транзакции. */
interface OutboxWriter {
  add(value: OutboxRecord): Promise<number>;
}

/**
 * Доступ к IndexedDB. Все методы асинхронные и не держат состояние.
 *
 * Каждое локальное изменение в той же транзакции пишет запись в outbox — очередь
 * на отправку в облако. Изменения, пришедшие из облака, применяются методами
 * applyRemote* и в outbox не попадают.
 */
@Injectable({ providedIn: 'root' })
export class MemoRepository {
  private readonly database = inject(AppDatabase);
  private readonly outboxVersionState = signal(0);

  /** Увеличивается после каждой новой записи в outbox — сигнал для синхронизации. */
  readonly outboxVersion = this.outboxVersionState.asReadonly();

  // ---------------------------------------------------------------------------
  // Колоды
  // ---------------------------------------------------------------------------

  async getAllDecks(): Promise<readonly Deck[]> {
    const db = await this.database.getDb();
    return db.getAll('decks');
  }

  async putDeck(deck: Deck): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(['decks', 'outbox'], 'readwrite');
    await Promise.all([
      tx.objectStore('decks').put(deck),
      this.enqueue(tx.objectStore('outbox'), { kind: 'upsert-deck', deck }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  /** Удаляет колоду вместе с карточками, изображениями и журналом. */
  async deleteDeckCascade(deckId: string): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(
      ['decks', 'cards', 'images', 'reviewLog', 'outbox'],
      'readwrite'
    );
    const cards = await tx.objectStore('cards').index('by-deck').getAll(deckId);
    const imageIds = cards
      .map((card) => card.imageId)
      .filter((id): id is string => id !== null);
    const logKeys = (
      await Promise.all(
        cards.map((card) =>
          tx.objectStore('reviewLog').index('by-card').getAllKeys(card.id)
        )
      )
    ).flat();

    await Promise.all([
      tx.objectStore('decks').delete(deckId),
      ...cards.map((card) => tx.objectStore('cards').delete(card.id)),
      ...imageIds.map((id) => tx.objectStore('images').delete(id)),
      ...logKeys.map((key) => tx.objectStore('reviewLog').delete(key)),
      this.enqueue(tx.objectStore('outbox'), {
        kind: 'delete-deck',
        deckId,
        imageIds,
        deletedAt: Date.now(),
      }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  // ---------------------------------------------------------------------------
  // Карточки
  // ---------------------------------------------------------------------------

  async getAllCards(): Promise<readonly Card[]> {
    const db = await this.database.getDb();
    return db.getAll('cards');
  }

  async putCard(card: Card): Promise<void> {
    await this.putCards([card]);
  }

  async putCards(cards: readonly Card[]): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(['cards', 'outbox'], 'readwrite');
    await Promise.all([
      ...cards.map((card) => tx.objectStore('cards').put(card)),
      this.enqueue(tx.objectStore('outbox'), { kind: 'upsert-cards', cards }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  async deleteCard(cardId: string, imageId: string | null): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(['cards', 'images', 'reviewLog', 'outbox'], 'readwrite');
    const logKeys = await tx
      .objectStore('reviewLog')
      .index('by-card')
      .getAllKeys(cardId);
    await Promise.all([
      tx.objectStore('cards').delete(cardId),
      imageId ? tx.objectStore('images').delete(imageId) : Promise.resolve(),
      ...logKeys.map((key) => tx.objectStore('reviewLog').delete(key)),
      this.enqueue(tx.objectStore('outbox'), { kind: 'delete-card', cardId, imageId, deletedAt: Date.now() }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  // ---------------------------------------------------------------------------
  // Изображения
  // ---------------------------------------------------------------------------

  async getImage(imageId: string): Promise<StoredImage | null> {
    const db = await this.database.getDb();
    return (await db.get('images', imageId)) ?? null;
  }

  async putImage(image: StoredImage): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(['images', 'outbox'], 'readwrite');
    await Promise.all([
      tx.objectStore('images').put(image),
      this.enqueue(tx.objectStore('outbox'), { kind: 'upsert-image', imageId: image.id }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  async deleteImage(imageId: string): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(['images', 'outbox'], 'readwrite');
    await Promise.all([
      tx.objectStore('images').delete(imageId),
      this.enqueue(tx.objectStore('outbox'), { kind: 'delete-image', imageId }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  async getAllImages(): Promise<readonly StoredImage[]> {
    const db = await this.database.getDb();
    return db.getAll('images');
  }

  async getAllImageIds(): Promise<readonly string[]> {
    const db = await this.database.getDb();
    return db.getAllKeys('images');
  }

  // ---------------------------------------------------------------------------
  // Журнал ответов
  // ---------------------------------------------------------------------------

  async addReviewLog(entry: ReviewLogEntry): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(['reviewLog', 'outbox'], 'readwrite');
    await Promise.all([
      tx.objectStore('reviewLog').put(entry),
      this.enqueue(tx.objectStore('outbox'), { kind: 'add-review', entry }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  async getReviewLogSince(since: number): Promise<readonly ReviewLogEntry[]> {
    const db = await this.database.getDb();
    return db.getAllFromIndex(
      'reviewLog',
      'by-reviewed-at',
      IDBKeyRange.lowerBound(since)
    );
  }

  async getAllReviewLog(): Promise<readonly ReviewLogEntry[]> {
    const db = await this.database.getDb();
    return db.getAll('reviewLog');
  }

  async deleteReviewLogForCard(cardId: string): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(['reviewLog', 'outbox'], 'readwrite');
    const keys = await tx.objectStore('reviewLog').index('by-card').getAllKeys(cardId);
    await Promise.all([
      ...keys.map((key) => tx.objectStore('reviewLog').delete(key)),
      this.enqueue(tx.objectStore('outbox'), { kind: 'clear-reviews', cardId }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  // ---------------------------------------------------------------------------
  // Настройки
  // ---------------------------------------------------------------------------

  async getSettings(): Promise<AppSettings> {
    const db = await this.database.getDb();
    const record = await db.get('settings', 'app');
    return { ...DEFAULT_SETTINGS, ...(record?.value ?? {}) };
  }

  async putSettings(settings: AppSettings): Promise<void> {
    const db = await this.database.getDb();
    const updatedAt = Date.now();
    const tx = db.transaction(['settings', 'meta', 'outbox'], 'readwrite');
    await Promise.all([
      tx.objectStore('settings').put({ key: 'app', value: settings }),
      tx.objectStore('meta').put({ key: META_SETTINGS_UPDATED_AT, value: updatedAt }),
      this.enqueue(tx.objectStore('outbox'), { kind: 'settings', settings, updatedAt }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  // ---------------------------------------------------------------------------
  // Резервные копии
  // ---------------------------------------------------------------------------

  /** Полностью заменяет содержимое базы данными из резервной копии (и облако — тоже). */
  async replaceAll(payload: BackupPayload): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(
      ['decks', 'cards', 'images', 'reviewLog', 'settings', 'meta', 'outbox'],
      'readwrite'
    );
    await Promise.all([
      tx.objectStore('decks').clear(),
      tx.objectStore('cards').clear(),
      tx.objectStore('images').clear(),
      tx.objectStore('reviewLog').clear(),
      tx.objectStore('outbox').clear(),
    ]);
    await Promise.all([
      ...payload.decks.map((deck) => tx.objectStore('decks').put(deck)),
      ...payload.cards.map((card) => tx.objectStore('cards').put(card)),
      ...payload.images.map((image) => tx.objectStore('images').put(image)),
      ...payload.reviewLog.map((entry) =>
        tx.objectStore('reviewLog').put(entry)
      ),
      // Копии из старых версий (и из Mac-приложения) могут не содержать части настроек.
      tx.objectStore('settings').put({
        key: 'app',
        value: { ...DEFAULT_SETTINGS, ...payload.settings },
      }),
      tx.objectStore('meta').put({ key: META_SETTINGS_UPDATED_AT, value: Date.now() }),
      this.enqueue(tx.objectStore('outbox'), { kind: 'replace-all' }),
    ]);
    await tx.done;
    this.notifyOutbox();
  }

  // ---------------------------------------------------------------------------
  // Синхронизация: outbox, meta, снимок, применение облачных изменений
  // ---------------------------------------------------------------------------

  async getOutbox(): Promise<readonly OutboxRecord[]> {
    const db = await this.database.getDb();
    return db.getAll('outbox');
  }

  async countOutbox(): Promise<number> {
    const db = await this.database.getDb();
    return db.count('outbox');
  }

  /** Удаляет обработанные записи очереди (с seq ≤ maxSeq). */
  async clearOutboxUpTo(maxSeq: number): Promise<void> {
    const db = await this.database.getDb();
    await db.delete('outbox', IDBKeyRange.upperBound(maxSeq));
  }

  /** Ставит в очередь отправку полного снимка локальной базы. */
  async enqueueSnapshot(): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction('outbox', 'readwrite');
    await this.enqueue(tx.objectStore('outbox'), { kind: 'snapshot' });
    await tx.done;
    this.notifyOutbox();
  }

  async getMeta(key: string): Promise<MetaRecord['value']> {
    const db = await this.database.getDb();
    return (await db.get('meta', key))?.value ?? null;
  }

  async setMeta(key: string, value: MetaRecord['value']): Promise<void> {
    const db = await this.database.getDb();
    await db.put('meta', { key, value });
  }

  async getSnapshot(): Promise<LocalSnapshot> {
    const db = await this.database.getDb();
    const [decks, cards, imageIds, reviewLog, settingsRecord, settingsMeta] =
      await Promise.all([
        db.getAll('decks'),
        db.getAll('cards'),
        db.getAllKeys('images'),
        db.getAll('reviewLog'),
        db.get('settings', 'app'),
        db.get('meta', META_SETTINGS_UPDATED_AT),
      ]);
    return {
      decks,
      cards,
      imageIds,
      reviewLog,
      settings: { ...DEFAULT_SETTINGS, ...(settingsRecord?.value ?? {}) },
      settingsUpdatedAt:
        typeof settingsMeta?.value === 'number' ? settingsMeta.value : 0,
    };
  }

  /** Сохраняет изображение, скачанное из облака (без записи в outbox). */
  async putImageFromCloud(image: StoredImage): Promise<void> {
    const db = await this.database.getDb();
    await db.put('images', image);
  }

  /**
   * Полная очистка локальных данных — когда на устройстве вошёл другой пользователь.
   * Настройки сбрасываются к значениям по умолчанию.
   */
  async clearAllLocal(): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(
      ['decks', 'cards', 'images', 'reviewLog', 'settings', 'meta', 'outbox'],
      'readwrite'
    );
    await Promise.all([
      tx.objectStore('decks').clear(),
      tx.objectStore('cards').clear(),
      tx.objectStore('images').clear(),
      tx.objectStore('reviewLog').clear(),
      tx.objectStore('settings').clear(),
      tx.objectStore('outbox').clear(),
      tx.objectStore('meta').delete(META_LAST_PULL_AT),
      tx.objectStore('meta').delete(META_SETTINGS_UPDATED_AT),
      tx.objectStore('meta').delete(META_CLOUD_USER_ID),
    ]);
    await tx.done;
  }

  /**
   * Применяет изменения из облака по правилу «последняя запись побеждает».
   * Tombstone удаляют локальные данные, если локальная версия не новее.
   */
  async applyRemoteBatch(batch: SyncPullResponse): Promise<RemoteApplyResult> {
    const db = await this.database.getDb();
    const tx = db.transaction(
      ['decks', 'cards', 'images', 'reviewLog', 'settings', 'meta'],
      'readwrite'
    );
    const decks = tx.objectStore('decks');
    const cards = tx.objectStore('cards');
    const images = tx.objectStore('images');
    const reviewLog = tx.objectStore('reviewLog');

    let changed = false;
    let missingImageIds: readonly string[] = [];

    for (const remote of batch.decks) {
      const local = await decks.get(remote.id);
      if (remote.deletedAt !== null) {
        if (local && local.updatedAt <= remote.updatedAt) {
          const deckCards = await cards.index('by-deck').getAll(remote.id);
          await Promise.all([
            decks.delete(remote.id),
            ...deckCards.flatMap((card) => [
              cards.delete(card.id),
              ...(card.imageId ? [images.delete(card.imageId)] : []),
            ]),
          ]);
          const logKeys = (
            await Promise.all(
              deckCards.map((card) => reviewLog.index('by-card').getAllKeys(card.id))
            )
          ).flat();
          await Promise.all(logKeys.map((key) => reviewLog.delete(key)));
          changed = true;
        }
        continue;
      }
      if (!local || local.updatedAt < remote.updatedAt) {
        await decks.put(stripDeck(remote));
        changed = true;
      }
    }

    for (const remote of batch.cards) {
      const local = await cards.get(remote.id);
      if (remote.deletedAt !== null) {
        if (local && local.updatedAt <= remote.updatedAt) {
          const logKeys = await reviewLog.index('by-card').getAllKeys(remote.id);
          await Promise.all([
            cards.delete(remote.id),
            ...(local.imageId ? [images.delete(local.imageId)] : []),
            ...logKeys.map((key) => reviewLog.delete(key)),
          ]);
          changed = true;
        }
        continue;
      }
      if (local && local.updatedAt >= remote.updatedAt) {
        continue;
      }
      const deckExists = (await decks.getKey(remote.deckId)) !== undefined;
      if (!deckExists) {
        continue;
      }
      await cards.put(stripCard(remote));
      changed = true;
      if (local?.imageId && local.imageId !== remote.imageId) {
        await images.delete(local.imageId);
      }
      if (remote.imageId && (await images.getKey(remote.imageId)) === undefined) {
        missingImageIds = [...missingImageIds, remote.imageId];
      }
    }

    for (const entry of batch.reviews) {
      if ((await reviewLog.getKey(entry.id)) !== undefined) {
        continue;
      }
      if ((await cards.getKey(entry.cardId)) === undefined) {
        continue;
      }
      await reviewLog.put(entry);
      changed = true;
    }

    if (batch.settings) {
      const metaRecord = await tx.objectStore('meta').get(META_SETTINGS_UPDATED_AT);
      const localUpdatedAt = typeof metaRecord?.value === 'number' ? metaRecord.value : 0;
      if (batch.settings.updatedAt > localUpdatedAt) {
        await Promise.all([
          tx.objectStore('settings').put({
            key: 'app',
            value: { ...DEFAULT_SETTINGS, ...batch.settings.value },
          }),
          tx.objectStore('meta').put({
            key: META_SETTINGS_UPDATED_AT,
            value: batch.settings.updatedAt,
          }),
        ]);
        changed = true;
      }
    }

    await tx.done;
    return { changed, missingImageIds: Array.from(new Set(missingImageIds)) };
  }

  // ---------------------------------------------------------------------------

  private enqueue(outbox: OutboxWriter, entry: OutboxEntry): Promise<number> {
    const record: Omit<OutboxRecord, 'seq'> = { entry, createdAt: Date.now() };
    // seq — автоинкрементный ключ, IndexedDB подставит его сам.
    return outbox.add(record as OutboxRecord);
  }

  private notifyOutbox(): void {
    this.outboxVersionState.update((version) => version + 1);
  }
}

function stripDeck(remote: RemoteDeck): Deck {
  return {
    id: remote.id,
    title: remote.title,
    description: remote.description,
    emoji: remote.emoji,
    isActive: remote.isActive,
    libraryId: remote.libraryId,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
  };
}

function stripCard(remote: RemoteCard): Card {
  return {
    id: remote.id,
    deckId: remote.deckId,
    question: remote.question,
    answer: remote.answer,
    imageId: remote.imageId,
    thumbnailDataUrl: remote.thumbnailDataUrl,
    scheduling: remote.scheduling,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
  };
}
