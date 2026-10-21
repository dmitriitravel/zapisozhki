import { ReviewGrade } from '@memo/shared/spaced-repetition';
import { Card } from '../models/interfaces';

/** Memo — обе стороны видны сразу, без оценок; Dremo — переворот и оценка. */
export type StudyMode = 'memo' | 'dremo';

export interface SessionResult {
  readonly reviewed: number;
  readonly again: number;
  readonly hard: number;
  readonly good: number;
  readonly easy: number;
}

export const EMPTY_SESSION_RESULT: SessionResult = {
  reviewed: 0,
  again: 0,
  hard: 0,
  good: 0,
  easy: 0,
};

/** Прогресс «N из M»: M — карточек в сессии, N — сколько разных карточек уже показано. */
export interface SessionProgress {
  readonly position: number;
  readonly remaining: number;
  readonly total: number;
}

export interface WaitingInfo {
  readonly card: Card;
  readonly countdown: string;
}

export interface GradeOption {
  readonly grade: ReviewGrade;
  readonly label: string;
  /** Через сколько карточка вернётся, например «10 мин» или «4 дн». */
  readonly delayLabel: string;
}

export interface StudyQueueSummary {
  readonly learningCount: number;
  readonly reviewCount: number;
  readonly newCount: number;
  readonly total: number;
}

export type CardStateTone = 'info' | 'warning' | 'accent' | 'muted';

/** Подпись состояния карточки для списков: «Новая», «Учится · 5 мин», «Через 3 дн». */
export interface CardStateLabel {
  readonly text: string;
  readonly tone: CardStateTone;
}
