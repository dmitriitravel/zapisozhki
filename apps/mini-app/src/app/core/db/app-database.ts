import { Injectable } from '@angular/core';
import { DBSchema, IDBPDatabase, openDB } from 'idb';
import {
  Card,
  Deck,
  MetaRecord,
  OutboxRecord,
  ReviewLogEntry,
  SettingsRecord,
  StoredImage,
} from '../models/interfaces';

export const DB_NAME = 'memo-cards';
/** v2: добавлены outbox (очередь на отправку в облако) и meta (состояние синхронизации). */
export const DB_VERSION = 2;

export interface MemoDbSchema extends DBSchema {
  decks: {
    key: string;
    value: Deck;
  };
  cards: {
    key: string;
    value: Card;
    indexes: { 'by-deck': string; 'by-due': number };
  };
  images: {
    key: string;
    value: StoredImage;
  };
  reviewLog: {
    key: string;
    value: ReviewLogEntry;
    indexes: { 'by-reviewed-at': number; 'by-card': string };
  };
  settings: {
    key: string;
    value: SettingsRecord;
  };
  outbox: {
    key: number;
    value: OutboxRecord;
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
}

export type MemoDb = IDBPDatabase<MemoDbSchema>;

@Injectable({ providedIn: 'root' })
export class AppDatabase {
  private dbPromise: Promise<MemoDb> | null = null;

  getDb(): Promise<MemoDb> {
    if (!this.dbPromise) {
      this.dbPromise = openDB<MemoDbSchema>(DB_NAME, DB_VERSION, {
        upgrade: (db, oldVersion) => {
          if (oldVersion < 1) {
            db.createObjectStore('decks', { keyPath: 'id' });

            const cards = db.createObjectStore('cards', { keyPath: 'id' });
            cards.createIndex('by-deck', 'deckId');
            cards.createIndex('by-due', 'scheduling.dueAt');

            db.createObjectStore('images', { keyPath: 'id' });

            const reviewLog = db.createObjectStore('reviewLog', {
              keyPath: 'id',
            });
            reviewLog.createIndex('by-reviewed-at', 'reviewedAt');
            reviewLog.createIndex('by-card', 'cardId');

            db.createObjectStore('settings', { keyPath: 'key' });
          }
          if (oldVersion < 2) {
            db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
            db.createObjectStore('meta', { keyPath: 'key' });
          }
        },
      });
    }
    return this.dbPromise;
  }
}
