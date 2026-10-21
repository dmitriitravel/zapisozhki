import { Injectable, inject } from '@angular/core';
import { TelegramService } from '@memo/shared/telegram';
import { MemoRepository } from '../db/memo-repository.service';
import { BackupPayload, BackupSummary, Card } from '../models/interfaces';
import { MemoStore } from '../store/memo-store.service';

const CLOUD_META_KEY = 'backup_meta';
const CLOUD_CHUNK_PREFIX = 'backup_chunk_';
/** Telegram CloudStorage хранит до 4096 символов в значении. */
const CLOUD_CHUNK_SIZE = 4000;
const CLOUD_MAX_KEYS = 1000;

interface CloudMeta {
  readonly exportedAt: number;
  readonly deckCount: number;
  readonly cardCount: number;
  readonly chunkCount: number;
}

/**
 * Резервные копии:
 *  - файл JSON (полная копия вместе с изображениями);
 *  - Telegram CloudStorage (без изображений, зато доступна с любого устройства).
 */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly repository = inject(MemoRepository);
  private readonly store = inject(MemoStore);
  private readonly telegram = inject(TelegramService);

  async createPayload(includeImages: boolean): Promise<BackupPayload> {
    const [decks, cards, images, reviewLog, settings] = await Promise.all([
      this.repository.getAllDecks(),
      this.repository.getAllCards(),
      includeImages ? this.repository.getAllImages() : Promise.resolve([]),
      this.repository.getAllReviewLog(),
      this.repository.getSettings(),
    ]);
    return {
      version: 1,
      exportedAt: Date.now(),
      decks,
      cards: includeImages ? cards : cards.map(stripImages),
      images,
      reviewLog,
      settings,
    };
  }

  async exportToFile(): Promise<void> {
    const payload = await this.createPayload(true);
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `memo-backup-${formatFileDate(payload.exportedAt)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async importFromFile(file: File): Promise<BackupSummary> {
    const text = await file.text();
    const payload = parsePayload(JSON.parse(text));
    await this.repository.replaceAll(payload);
    await this.store.reload();
    return summarize(payload);
  }

  isCloudAvailable(): boolean {
    return this.telegram.isCloudStorageAvailable() || !this.telegram.isAvailable();
  }

  async saveToCloud(): Promise<BackupSummary> {
    const payload = await this.createPayload(false);
    const json = JSON.stringify(payload);
    const chunks = splitChunks(json, CLOUD_CHUNK_SIZE);
    if (chunks.length > CLOUD_MAX_KEYS) {
      throw new Error(
        'Слишком много данных для облака Telegram. Используйте экспорт в файл.'
      );
    }
    const meta: CloudMeta = {
      exportedAt: payload.exportedAt,
      deckCount: payload.decks.length,
      cardCount: payload.cards.length,
      chunkCount: chunks.length,
    };

    await this.clearCloudChunks();
    await Promise.all(
      chunks.map((chunk, index) =>
        this.telegram.cloudSetItem(`${CLOUD_CHUNK_PREFIX}${index}`, chunk)
      )
    );
    await this.telegram.cloudSetItem(CLOUD_META_KEY, JSON.stringify(meta));
    return summarize(payload);
  }

  async getCloudSummary(): Promise<BackupSummary | null> {
    const items = await this.telegram.cloudGetItems([CLOUD_META_KEY]);
    const raw = items[CLOUD_META_KEY];
    if (!raw) {
      return null;
    }
    const meta = JSON.parse(raw) as CloudMeta;
    return {
      exportedAt: meta.exportedAt,
      deckCount: meta.deckCount,
      cardCount: meta.cardCount,
    };
  }

  async restoreFromCloud(): Promise<BackupSummary> {
    const metaItems = await this.telegram.cloudGetItems([CLOUD_META_KEY]);
    const rawMeta = metaItems[CLOUD_META_KEY];
    if (!rawMeta) {
      throw new Error('В облаке Telegram нет резервной копии');
    }
    const meta = JSON.parse(rawMeta) as CloudMeta;
    const keys = Array.from(
      { length: meta.chunkCount },
      (_, index) => `${CLOUD_CHUNK_PREFIX}${index}`
    );
    const items = await this.telegram.cloudGetItems(keys);
    const json = keys.map((key) => items[key] ?? '').join('');
    const payload = parsePayload(JSON.parse(json));
    await this.repository.replaceAll(payload);
    await this.store.reload();
    return summarize(payload);
  }

  private async clearCloudChunks(): Promise<void> {
    const keys = await this.telegram.cloudGetKeys();
    const stale = keys.filter((key) => key.startsWith(CLOUD_CHUNK_PREFIX));
    await this.telegram.cloudRemoveItems(stale);
  }
}

function stripImages(card: Card): Card {
  return { ...card, imageId: null, thumbnailDataUrl: null };
}

function splitChunks(text: string, size: number): readonly string[] {
  const count = Math.ceil(text.length / size);
  return Array.from({ length: count }, (_, index) =>
    text.slice(index * size, (index + 1) * size)
  );
}

function summarize(payload: BackupPayload): BackupSummary {
  return {
    exportedAt: payload.exportedAt,
    deckCount: payload.decks.length,
    cardCount: payload.cards.length,
  };
}

function parsePayload(raw: unknown): BackupPayload {
  if (!isRecord(raw) || raw['version'] !== 1) {
    throw new Error('Неподдерживаемый формат резервной копии');
  }
  if (!Array.isArray(raw['decks']) || !Array.isArray(raw['cards'])) {
    throw new Error('Повреждённая резервная копия');
  }
  return raw as unknown as BackupPayload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function formatFileDate(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}
