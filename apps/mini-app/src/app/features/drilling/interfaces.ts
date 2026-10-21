export type SwipeDirection = 'left' | 'right' | null;

export interface SwipeState {
  readonly startX: number;
  readonly startY: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly active: boolean;
}

export const IDLE_SWIPE: SwipeState = {
  startX: 0,
  startY: 0,
  deltaX: 0,
  deltaY: 0,
  active: false,
};

/** Карточка «улетает» в сторону после свайпа, затем ставится оценка. */
export type FlyAwayDirection = 'left' | 'right' | null;

export type CardQueueMenuAction =
  | 'speak-question'
  | 'speak-answer'
  | 'edit'
  | 'open-deck'
  | 'reset'
  | 'delete';

export type AddMenuAction = 'new-card' | 'new-deck' | 'library';

/** Вкладки шторки Drilling list: карточки на сегодня или все карточки области. */
export type DrillingListTab = 'today' | 'all';
