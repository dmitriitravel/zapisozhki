import { Deck, DeckStats } from '../../core/models/interfaces';

export interface DeckListItem {
  readonly deck: Deck;
  readonly stats: DeckStats;
}

export type DeckMenuAction = 'study' | 'edit' | 'toggle-active' | 'delete';

export type CardMenuAction = 'edit' | 'reset' | 'delete';

export interface DeckEditorForm {
  readonly title: string;
  readonly description: string;
  readonly emoji: string;
}

export const DECK_EMOJIS: readonly string[] = [
  '📚',
  '🧠',
  '🌍',
  '🇬🇧',
  '🧪',
  '📐',
  '🎨',
  '🎵',
  '💻',
  '⚖️',
  '🏛️',
  '🧬',
  '💊',
  '🍳',
  '✈️',
  '⭐',
];
