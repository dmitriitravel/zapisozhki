import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Injectable,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import { MemoRepository } from '../db/memo-repository.service';
import { StoredImage } from '../models/interfaces';
import { MemoStore } from '../store/memo-store.service';
import { CloudAuthService } from './cloud-auth.service';
import { dataUrlToBlob, imageStoragePath, storedImageFromBlob } from './cloud-images';
import {
  CloudSession,
  ImageOperation,
  META_CLOUD_USER_ID,
  META_LAST_PULL_AT,
  RemoteCard,
  RemoteDeck,
  STORAGE_BUCKET,
  SyncPullResponse,
  SyncStatus,
} from './interfaces';
import {
  buildPushPlan,
  isPayloadEmpty,
  needsSnapshot,
  splitPushPayload,
} from './push-plan';
import { SupabaseClientService } from './supabase-client.service';

/** Пауза после локального изменения перед отправкой — чтобы склеить серию правок. */
const FLUSH_DEBOUNCE_MS = 1500;
/** Как часто проверять облако на изменения с других устройств. */
const PULL_INTERVAL_MS = 2 * 60 * 1000;
/** Запас при запросе изменений «с прошлого раза» — защита от гонок с часами сервера. */
const PULL_OVERLAP_MS = 10 * 1000;
const RETRY_BASE_MS = 15 * 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;
/** Сколько объектов за раз запрашивать при очистке папки пользователя в Storage. */
const STORAGE_LIST_LIMIT = 1000;

const INITIAL_STATUS: SyncStatus = {
  state: 'disabled',
  lastSyncAt: null,
  pendingCount: 0,
  message: '',
};

interface CycleOptions {
  /** Запрашивать ли изменения из облака (иначе — только отправка очереди). */
  readonly pull: boolean;
}

/**
 * Синхронизация локальной базы с Supabase.
 *
 * Локальная база — кэш и источник для UI, облако — общее хранилище для всех устройств.
 * Изменения уходят из outbox пачками (с задержкой), изменения с других устройств
 * забираются при старте, при возврате в приложение и периодически.
 */
@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly repository = inject(MemoRepository);
  private readonly store = inject(MemoStore);
  private readonly auth = inject(CloudAuthService);
  private readonly supabase = inject(SupabaseClientService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly statusState = signal<SyncStatus>(INITIAL_STATUS);
  readonly status = this.statusState.asReadonly();

  private started = false;
  private session: CloudSession | null = null;
  private running: Promise<void> | null = null;
  private queued = false;
  private queuedPull = false;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private failures = 0;
  private lastPullAt = 0;

  private readonly onOnline = (): void => {
    void this.request({ pull: true });
  };

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'visible') {
      void this.request({ pull: true });
    }
  };

  constructor() {
    effect(() => {
      this.repository.outboxVersion();
      untracked(() => this.scheduleFlush());
    });
  }

  isAvailable(): boolean {
    return this.auth.isAvailable();
  }

  /** Запускает фоновую синхронизацию (вызывается один раз после загрузки базы). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    if (!this.auth.isAvailable()) {
      this.statusState.set({
        ...INITIAL_STATUS,
        message: this.supabase.isConfigured()
          ? 'Доступна только в Telegram'
          : 'Облако не настроено',
      });
      return;
    }

    const window = this.document.defaultView;
    window?.addEventListener('online', this.onOnline);
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
    const timer = setInterval(() => void this.request({ pull: true }), PULL_INTERVAL_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      window?.removeEventListener('online', this.onOnline);
      this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
      this.clearTimers();
    });

    void this.request({ pull: true });
  }

  /** Принудительная синхронизация (кнопка в настройках). */
  syncNow(): Promise<void> {
    return this.request({ pull: true });
  }

  /** Скачивает изображение из облака и сохраняет локально. null — если его нет. */
  async downloadImage(imageId: string): Promise<StoredImage | null> {
    if (!this.auth.isAvailable()) {
      return null;
    }
    try {
      const client = await this.supabase.getClient();
      const session = this.session ?? (await this.auth.ensureSession());
      if (!session) {
        return null;
      }
      this.session = session;
      const { data, error } = await client.storage
        .from(STORAGE_BUCKET)
        .download(imageStoragePath(session.userId, imageId));
      if (error || !data) {
        return null;
      }
      const image = await storedImageFromBlob(imageId, data);
      await this.repository.putImageFromCloud(image);
      return image;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------

  private request(options: CycleOptions): Promise<void> {
    if (!this.started || !this.auth.isAvailable()) {
      return Promise.resolve();
    }
    if (this.running) {
      this.queued = true;
      this.queuedPull = this.queuedPull || options.pull;
      return this.running;
    }
    this.running = this.runCycle(options).finally(() => {
      this.running = null;
      if (this.queued) {
        const pull = this.queuedPull;
        this.queued = false;
        this.queuedPull = false;
        void this.request({ pull });
      }
    });
    return this.running;
  }

  private async runCycle(options: CycleOptions): Promise<void> {
    if (this.document.defaultView?.navigator.onLine === false) {
      this.patchStatus({ state: 'offline', message: 'Нет сети — изменения отправятся позже' });
      return;
    }
    this.patchStatus({ state: 'syncing', message: '' });
    try {
      const client = await this.supabase.getClient();
      const session = await this.auth.ensureSession();
      if (!session) {
        this.patchStatus({ state: 'unauthenticated', message: 'Нет входа через Telegram' });
        return;
      }
      this.session = session;
      await this.ensureAccount(session);

      const pullDue = options.pull || Date.now() - this.lastPullAt > PULL_INTERVAL_MS;
      if (pullDue) {
        await this.pull(client);
      }
      await this.flush(client, session);

      this.failures = 0;
      this.patchStatus({
        state: 'idle',
        lastSyncAt: Date.now(),
        pendingCount: await this.repository.countOutbox(),
        message: '',
      });
    } catch (error) {
      this.failures += 1;
      this.patchStatus({
        state: 'error',
        pendingCount: await this.repository.countOutbox(),
        message: error instanceof Error ? error.message : 'Ошибка синхронизации',
      });
      this.scheduleRetry();
    }
  }

  /**
   * Привязка устройства к аккаунту: при первом входе локальные данные отправляются
   * в облако целиком; если вошёл другой пользователь — локальные данные очищаются.
   */
  private async ensureAccount(session: CloudSession): Promise<void> {
    const known = await this.repository.getMeta(META_CLOUD_USER_ID);
    if (known === session.userId) {
      return;
    }
    if (known === null) {
      await this.repository.enqueueSnapshot();
    } else {
      await this.repository.clearAllLocal();
      await this.store.reload();
    }
    await this.repository.setMeta(META_CLOUD_USER_ID, session.userId);
  }

  private async pull(client: SupabaseClient): Promise<void> {
    const sinceMeta = await this.repository.getMeta(META_LAST_PULL_AT);
    const since = typeof sinceMeta === 'number' ? sinceMeta : null;
    const { data, error } = await client.rpc('sync_pull', { since });
    if (error) {
      throw new Error(`Загрузка из облака: ${error.message}`);
    }
    const batch = normalizeBatch(data);
    const result = await this.repository.applyRemoteBatch(batch);
    await this.repository.setMeta(META_LAST_PULL_AT, batch.serverTime - PULL_OVERLAP_MS);
    this.lastPullAt = Date.now();

    if (result.changed) {
      await this.store.reload();
    }
    if (result.missingImageIds.length > 0) {
      void this.downloadImages(result.missingImageIds);
    }
  }

  private async flush(client: SupabaseClient, session: CloudSession): Promise<void> {
    const records = await this.repository.getOutbox();
    if (records.length === 0) {
      return;
    }
    const snapshot = needsSnapshot(records) ? await this.repository.getSnapshot() : null;
    const plan = buildPushPlan(records, snapshot);

    if (plan.payload.replaceAll) {
      await this.clearRemoteImages(client, session.userId);
    }
    await this.uploadImages(
      client,
      session.userId,
      plan.images.filter((operation) => operation.kind === 'upload')
    );

    for (const payload of splitPushPayload(plan.payload)) {
      if (isPayloadEmpty(payload)) {
        continue;
      }
      const { error } = await client.rpc('sync_push', { payload });
      if (error) {
        throw new Error(`Отправка в облако: ${error.message}`);
      }
    }

    await this.removeImages(
      client,
      session.userId,
      plan.images.filter((operation) => operation.kind === 'remove')
    );
    await this.repository.clearOutboxUpTo(plan.maxSeq);
  }

  private async uploadImages(
    client: SupabaseClient,
    userId: string,
    operations: readonly ImageOperation[]
  ): Promise<void> {
    for (const { imageId } of operations) {
      const image = await this.repository.getImage(imageId);
      const blob = image ? dataUrlToBlob(image.dataUrl) : null;
      if (!blob) {
        continue;
      }
      const { error } = await client.storage
        .from(STORAGE_BUCKET)
        .upload(imageStoragePath(userId, imageId), blob, {
          contentType: blob.type,
          upsert: true,
        });
      if (error) {
        throw new Error(`Загрузка изображения: ${error.message}`);
      }
    }
  }

  private async removeImages(
    client: SupabaseClient,
    userId: string,
    operations: readonly ImageOperation[]
  ): Promise<void> {
    if (operations.length === 0) {
      return;
    }
    const paths = operations.map(({ imageId }) => imageStoragePath(userId, imageId));
    // Удаление — best effort: отсутствующий файл не должен блокировать очередь.
    await client.storage.from(STORAGE_BUCKET).remove(paths);
  }

  /** Перед полной заменой данных (restore) чистим папку пользователя в Storage. */
  private async clearRemoteImages(client: SupabaseClient, userId: string): Promise<void> {
    const { data } = await client.storage
      .from(STORAGE_BUCKET)
      .list(userId, { limit: STORAGE_LIST_LIMIT });
    const names = (data ?? []).map((object) => `${userId}/${object.name}`);
    if (names.length > 0) {
      await client.storage.from(STORAGE_BUCKET).remove(names);
    }
  }

  private async downloadImages(imageIds: readonly string[]): Promise<void> {
    for (const imageId of imageIds) {
      await this.downloadImage(imageId);
    }
  }

  private scheduleFlush(): void {
    if (!this.started || !this.auth.isAvailable()) {
      return;
    }
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.request({ pull: false });
    }, FLUSH_DEBOUNCE_MS);
  }

  private scheduleRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** (this.failures - 1));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.request({ pull: true });
    }, delay);
  }

  private clearTimers(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  private patchStatus(patch: Partial<SyncStatus>): void {
    this.statusState.update((status) => ({ ...status, ...patch }));
  }
}

/** Приводит ответ RPC к ожидаемой форме (на случай отсутствующих полей). */
function normalizeBatch(raw: unknown): SyncPullResponse {
  const data = (raw ?? {}) as Partial<SyncPullResponse>;
  return {
    serverTime: typeof data.serverTime === 'number' ? data.serverTime : Date.now(),
    decks: (data.decks ?? []).map(
      (deck): RemoteDeck => ({ ...deck, deletedAt: deck.deletedAt ?? null })
    ),
    cards: (data.cards ?? []).map(
      (card): RemoteCard => ({ ...card, deletedAt: card.deletedAt ?? null })
    ),
    reviews: data.reviews ?? [],
    settings: data.settings ?? null,
  };
}
