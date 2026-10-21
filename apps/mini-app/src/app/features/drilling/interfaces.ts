export interface SessionProgress {
  readonly done: number;
  readonly remaining: number;
  readonly total: number;
  readonly percent: number;
}

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

export type SwipeDirection = 'left' | 'right' | null;

export interface SwipeState {
  readonly startX: number;
  readonly startY: number;
  readonly deltaX: number;
  readonly active: boolean;
}

export const IDLE_SWIPE: SwipeState = {
  startX: 0,
  startY: 0,
  deltaX: 0,
  active: false,
};

export type CardQueueMenuAction = 'edit' | 'reset' | 'delete';
