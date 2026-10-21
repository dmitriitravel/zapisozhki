import {
  CardLearningState,
  ReviewGrade,
  SchedulingState,
} from '@memo/shared/spaced-repetition';

/** Колода (проект) — набор карточек на одну тему. */
export interface Deck {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly emoji: string;
  /** Участвует ли колода в общем списке повторения. */
  readonly isActive: boolean;
  /** Идентификатор колоды из библиотеки, если она добавлена оттуда. */
  readonly libraryId: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

/** Карточка: вопрос (лицевая сторона) и ответ (обратная сторона). */
export interface Card {
  readonly id: string;
  readonly deckId: string;
  readonly question: string;
  readonly answer: string;
  /** Ссылка на полноразмерное изображение в хранилище images. */
  readonly imageId: string | null;
  /** Маленькое превью (data URL) для списков; хранится прямо в карточке. */
  readonly thumbnailDataUrl: string | null;
  readonly scheduling: SchedulingState;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface StoredImage {
  readonly id: string;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: number;
}

export interface ReviewLogEntry {
  readonly id: string;
  readonly cardId: string;
  readonly deckId: string;
  readonly grade: ReviewGrade;
  readonly reviewedAt: number;
  readonly stateBefore: CardLearningState;
  readonly stateAfter: CardLearningState;
}

export interface AppSettings {
  /** Сколько новых карточек вводить в день. */
  readonly newCardsPerDay: number;
  readonly hapticsEnabled: boolean;
  /** Оценивать карточку свайпом (вправо — «Есть», влево — «Ещё раз»). */
  readonly swipeToRate: boolean;
  /** Озвучивать вопрос автоматически при перевороте карточки. */
  readonly autoSpeak: boolean;
  /** Скорость речи, 0.2–0.7 (как в Mac-версии; 0.5 — обычная). */
  readonly speechRate: number;
  /** На лицевой стороне показывать только изображение (если оно есть). */
  readonly imageOnlyFront: boolean;
  /** Имя пользователя для аватара (если не задано — берётся из Telegram). */
  readonly userName: string;
}

export interface SettingsRecord {
  readonly key: 'app';
  readonly value: AppSettings;
}

/**
 * Запись исходящей очереди синхронизации: что изменилось локально и ещё не отправлено
 * в облако. Пишется в той же транзакции IndexedDB, что и само изменение.
 */
export type OutboxEntry =
  | { readonly kind: 'upsert-deck'; readonly deck: Deck }
  | { readonly kind: 'upsert-cards'; readonly cards: readonly Card[] }
  | { readonly kind: 'delete-deck'; readonly deckId: string; readonly imageIds: readonly string[]; readonly deletedAt: number }
  | { readonly kind: 'delete-card'; readonly cardId: string; readonly imageId: string | null; readonly deletedAt: number }
  | { readonly kind: 'upsert-image'; readonly imageId: string }
  | { readonly kind: 'delete-image'; readonly imageId: string }
  | { readonly kind: 'add-review'; readonly entry: ReviewLogEntry }
  | { readonly kind: 'clear-reviews'; readonly cardId: string }
  | { readonly kind: 'settings'; readonly settings: AppSettings; readonly updatedAt: number }
  /** Отправить в облако полный снимок локальной базы (первая синхронизация устройства). */
  | { readonly kind: 'snapshot' }
  /** Полностью заменить данные в облаке локальными (восстановление из резервной копии). */
  | { readonly kind: 'replace-all' };

export interface OutboxRecord {
  /** Автоинкрементный ключ — порядок операций. */
  readonly seq: number;
  readonly entry: OutboxEntry;
  readonly createdAt: number;
}

/** Служебные значения (состояние синхронизации и т. п.). */
export interface MetaRecord {
  readonly key: string;
  readonly value: string | number | boolean | null;
}

/** Полный снимок локальной базы для отправки в облако. */
export interface LocalSnapshot {
  readonly decks: readonly Deck[];
  readonly cards: readonly Card[];
  readonly imageIds: readonly string[];
  readonly reviewLog: readonly ReviewLogEntry[];
  readonly settings: AppSettings;
  readonly settingsUpdatedAt: number;
}

export interface DeckStats {
  readonly deckId: string;
  readonly total: number;
  readonly newCount: number;
  readonly learningCount: number;
  readonly dueCount: number;
  /** Карточки в review с интервалом от 21 дня считаются выученными. */
  readonly learnedCount: number;
}

export interface DeckDraft {
  readonly title: string;
  readonly description: string;
  readonly emoji: string;
  /** Участвует ли колода в Drilling list (общем повторении). */
  readonly isActive: boolean;
}

export interface CardDraft {
  readonly question: string;
  readonly answer: string;
  readonly imageId: string | null;
  readonly thumbnailDataUrl: string | null;
}

/** Результат обработки выбранного пользователем изображения. */
export interface ProcessedImage {
  readonly full: StoredImage;
  readonly thumbnailDataUrl: string;
}

/** Карточка готовой колоды из библиотеки. */
export interface LibraryCard {
  readonly question: string;
  readonly answer: string;
  /** Путь к изображению в assets (необязательно). */
  readonly imageUrl?: string;
}

export interface LibraryDeck {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly emoji: string;
  readonly language: string;
  readonly cards: readonly LibraryCard[];
}

export interface LibraryIndexEntry {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly emoji: string;
  readonly language: string;
  readonly cardCount: number;
  readonly file: string;
}

/** Формат файла резервной копии / экспорта. */
export interface BackupPayload {
  readonly version: 1;
  readonly exportedAt: number;
  readonly decks: readonly Deck[];
  readonly cards: readonly Card[];
  readonly images: readonly StoredImage[];
  readonly reviewLog: readonly ReviewLogEntry[];
  readonly settings: AppSettings;
}

export interface BackupSummary {
  readonly exportedAt: number;
  readonly deckCount: number;
  readonly cardCount: number;
}

export interface StudyStats {
  readonly totalCards: number;
  readonly learnedCards: number;
  readonly dueToday: number;
  readonly reviewedToday: number;
  readonly streakDays: number;
  /** Повторения по дням за последние две недели (от старых к новым). */
  readonly dailyReviews: readonly DailyReviewPoint[];
}

export interface DailyReviewPoint {
  /** Начало дня (локальное время), мс. */
  readonly day: number;
  readonly count: number;
}

/** Точка кривой запоминания: день и доля удержания в процентах. */
export interface RetentionPoint {
  readonly day: number;
  readonly retention: number;
}

/** Сегмент кривой интервального повторения (между двумя повторениями). */
export interface RetentionSegment {
  readonly index: number;
  readonly points: readonly RetentionPoint[];
}
