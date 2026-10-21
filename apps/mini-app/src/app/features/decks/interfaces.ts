import { Deck, DeckStats } from '../../core/models/interfaces';

export interface DeckListItem {
  readonly deck: Deck;
  readonly stats: DeckStats;
}

export type DeckMenuAction =
  | 'study'
  | 'memo'
  | 'edit'
  | 'toggle-active'
  | 'reset-all'
  | 'delete';

export type CardMenuAction = 'speak' | 'edit' | 'reset' | 'delete';

export interface DeckEditorForm {
  readonly title: string;
  readonly description: string;
  readonly emoji: string;
  /** Участвует ли колода в Drilling list. */
  readonly isActive: boolean;
}

/** Набор эмодзи для колоды — как в Mac-версии. */
export const DECK_EMOJIS: readonly string[] = [
  '📚',
  '🇬🇧',
  '🇩🇪',
  '🇫🇷',
  '🇪🇸',
  '🧠',
  '🌍',
  '💻',
  '🧪',
  '📐',
  '🎵',
  '🏛️',
  '⚖️',
  '💊',
  '🍳',
  '✈️',
];
