import { Injectable, inject } from '@angular/core';
import {
  AppSettings,
  BackupPayload,
  Card,
  Deck,
  ReviewLogEntry,
  StoredImage,
} from '../models/interfaces';
import { AppDatabase } from './app-database';

export const DEFAULT_SETTINGS: AppSettings = {
  newCardsPerDay: 20,
  hapticsEnabled: true,
  swipeToRate: true,
};

/** Доступ к IndexedDB. Все методы асинхронные и не держат состояние. */
@Injectable({ providedIn: 'root' })
export class MemoRepository {
  private readonly database = inject(AppDatabase);

  async getAllDecks(): Promise<readonly Deck[]> {
    const db = await this.database.getDb();
    return db.getAll('decks');
  }

  async putDeck(deck: Deck): Promise<void> {
    const db = await this.database.getDb();
    await db.put('decks', deck);
  }

  /** Удаляет колоду вместе с карточками, изображениями и журналом. */
  async deleteDeckCascade(deckId: string): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(
      ['decks', 'cards', 'images', 'reviewLog'],
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
    ]);
    await tx.done;
  }

  async getAllCards(): Promise<readonly Card[]> {
    const db = await this.database.getDb();
    return db.getAll('cards');
  }

  async putCard(card: Card): Promise<void> {
    const db = await this.database.getDb();
    await db.put('cards', card);
  }

  async putCards(cards: readonly Card[]): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction('cards', 'readwrite');
    await Promise.all(cards.map((card) => tx.store.put(card)));
    await tx.done;
  }

  async deleteCard(cardId: string, imageId: string | null): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(['cards', 'images', 'reviewLog'], 'readwrite');
    const logKeys = await tx
      .objectStore('reviewLog')
      .index('by-card')
      .getAllKeys(cardId);
    await Promise.all([
      tx.objectStore('cards').delete(cardId),
      imageId ? tx.objectStore('images').delete(imageId) : Promise.resolve(),
      ...logKeys.map((key) => tx.objectStore('reviewLog').delete(key)),
    ]);
    await tx.done;
  }

  async getImage(imageId: string): Promise<StoredImage | null> {
    const db = await this.database.getDb();
    return (await db.get('images', imageId)) ?? null;
  }

  async putImage(image: StoredImage): Promise<void> {
    const db = await this.database.getDb();
    await db.put('images', image);
  }

  async deleteImage(imageId: string): Promise<void> {
    const db = await this.database.getDb();
    await db.delete('images', imageId);
  }

  async getAllImages(): Promise<readonly StoredImage[]> {
    const db = await this.database.getDb();
    return db.getAll('images');
  }

  async addReviewLog(entry: ReviewLogEntry): Promise<void> {
    const db = await this.database.getDb();
    await db.put('reviewLog', entry);
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
    const tx = db.transaction('reviewLog', 'readwrite');
    const keys = await tx.store.index('by-card').getAllKeys(cardId);
    await Promise.all(keys.map((key) => tx.store.delete(key)));
    await tx.done;
  }

  async getSettings(): Promise<AppSettings> {
    const db = await this.database.getDb();
    const record = await db.get('settings', 'app');
    return { ...DEFAULT_SETTINGS, ...(record?.value ?? {}) };
  }

  async putSettings(settings: AppSettings): Promise<void> {
    const db = await this.database.getDb();
    await db.put('settings', { key: 'app', value: settings });
  }

  /** Полностью заменяет содержимое базы данными из резервной копии. */
  async replaceAll(payload: BackupPayload): Promise<void> {
    const db = await this.database.getDb();
    const tx = db.transaction(
      ['decks', 'cards', 'images', 'reviewLog', 'settings'],
      'readwrite'
    );
    await Promise.all([
      tx.objectStore('decks').clear(),
      tx.objectStore('cards').clear(),
      tx.objectStore('images').clear(),
      tx.objectStore('reviewLog').clear(),
    ]);
    await Promise.all([
      ...payload.decks.map((deck) => tx.objectStore('decks').put(deck)),
      ...payload.cards.map((card) => tx.objectStore('cards').put(card)),
      ...payload.images.map((image) => tx.objectStore('images').put(image)),
      ...payload.reviewLog.map((entry) =>
        tx.objectStore('reviewLog').put(entry)
      ),
      tx.objectStore('settings').put({ key: 'app', value: payload.settings }),
    ]);
    await tx.done;
  }
}
