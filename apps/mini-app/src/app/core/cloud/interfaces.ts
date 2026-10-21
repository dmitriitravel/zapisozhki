import { AppSettings, Card, Deck, ReviewLogEntry } from '../models/interfaces';

/** Строка колоды из облака: может быть tombstone (deletedAt). */
export interface RemoteDeck extends Deck {
  readonly deletedAt: number | null;
}

export interface RemoteCard extends Card {
  readonly deletedAt: number | null;
}

export interface RemoteSettings {
  readonly value: Partial<AppSettings>;
  readonly updatedAt: number;
}

/** Ответ RPC sync_pull. */
export interface SyncPullResponse {
  /** Серверное время, мс — точка отсчёта для следующего запроса. */
  readonly serverTime: number;
  readonly decks: readonly RemoteDeck[];
  readonly cards: readonly RemoteCard[];
  readonly reviews: readonly ReviewLogEntry[];
  readonly settings: RemoteSettings | null;
}

export interface DeletionMark {
  readonly id: string;
  readonly deletedAt: number;
}

/** Аргумент RPC sync_push. */
export interface SyncPushPayload {
  readonly replaceAll: boolean;
  readonly deletedDecks: readonly DeletionMark[];
  readonly deletedCards: readonly DeletionMark[];
  readonly clearedReviewCardIds: readonly string[];
  readonly decks: readonly Deck[];
  readonly cards: readonly Card[];
  readonly reviews: readonly ReviewLogEntry[];
  readonly settings: RemoteSettings | null;
}

export interface SyncPushResponse {
  readonly serverTime: number;
}

export type ImageOperationKind = 'upload' | 'remove';

export interface ImageOperation {
  readonly kind: ImageOperationKind;
  readonly imageId: string;
}

/** Что отправить в облако: свёрнутая очередь outbox. */
export interface PushPlan {
  readonly payload: SyncPushPayload;
  readonly images: readonly ImageOperation[];
  /** Последний обработанный seq очереди — до него записи можно удалить после успеха. */
  readonly maxSeq: number;
  readonly isEmpty: boolean;
}

/** Результат применения облачных изменений к локальной базе. */
export interface RemoteApplyResult {
  readonly changed: boolean;
  /** Изображения, на которые ссылаются карточки, но которых нет локально. */
  readonly missingImageIds: readonly string[];
}

export type SyncState =
  /** Supabase не настроен или приложение открыто не в Telegram. */
  | 'disabled'
  | 'unauthenticated'
  | 'idle'
  | 'syncing'
  | 'offline'
  | 'error';

export interface SyncStatus {
  readonly state: SyncState;
  readonly lastSyncAt: number | null;
  readonly pendingCount: number;
  readonly message: string;
}

export interface CloudSession {
  readonly userId: string;
  readonly telegramId: number | null;
}

/** Ответ Edge Function telegram-auth. */
export interface TelegramAuthResponse {
  readonly tokenHash: string;
  readonly userId: string;
  readonly telegramId: number;
}

/** Ключи служебных значений в таблице meta. */
export const META_LAST_PULL_AT = 'sync:lastPullAt';
export const META_SETTINGS_UPDATED_AT = 'sync:settingsUpdatedAt';
export const META_CLOUD_USER_ID = 'sync:cloudUserId';

export const STORAGE_BUCKET = 'card-images';
