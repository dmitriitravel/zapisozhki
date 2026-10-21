/**
 * Оценка ответа пользователя на карточку.
 * again — не вспомнил, hard — вспомнил с трудом, good — вспомнил, easy — легко.
 */
export type ReviewGrade = 'again' | 'hard' | 'good' | 'easy';

/**
 * Стадия обучения карточки.
 * new — ещё ни разу не показывалась;
 * learning — проходит короткие шаги заучивания (минуты);
 * review — в долгосрочном повторении (дни);
 * relearning — забыта после review и снова проходит короткие шаги.
 */
export type CardLearningState = 'new' | 'learning' | 'review' | 'relearning';

export interface SchedulingState {
  readonly state: CardLearningState;
  /** Индекс текущего шага для learning / relearning. */
  readonly step: number;
  /** Текущий интервал в днях (имеет смысл для review). */
  readonly intervalDays: number;
  /** Коэффициент лёгкости (SM-2 ease factor), по умолчанию 2.5. */
  readonly easeFactor: number;
  /** Сколько раз карточка была успешно отвечена подряд. */
  readonly repetitions: number;
  /** Сколько раз карточка была забыта после перехода в review. */
  readonly lapses: number;
  /** Момент (epoch ms), когда карточку нужно показать снова. */
  readonly dueAt: number;
  /** Момент последнего ответа (epoch ms) либо null, если ответов не было. */
  readonly lastReviewedAt: number | null;
}

export interface SchedulerConfig {
  /** Шаги заучивания новой карточки в минутах, например [1, 10]. */
  readonly learningStepsMinutes: readonly number[];
  /** Шаги повторного заучивания после ошибки в минутах, например [10]. */
  readonly relearningStepsMinutes: readonly number[];
  /** Интервал (дни) после прохождения всех шагов заучивания. */
  readonly graduatingIntervalDays: number;
  /** Интервал (дни) при ответе easy на новой карточке. */
  readonly easyIntervalDays: number;
  readonly startingEase: number;
  readonly minEase: number;
  /** Множитель интервала при ответе easy в review. */
  readonly easyBonus: number;
  /** Множитель интервала при ответе hard в review. */
  readonly hardIntervalMultiplier: number;
  /** На сколько уменьшается интервал при ошибке в review. */
  readonly lapseIntervalMultiplier: number;
  readonly maxIntervalDays: number;
}

export interface SchedulingPreview {
  readonly grade: ReviewGrade;
  readonly next: SchedulingState;
  /** Через сколько миллисекунд карточка снова станет доступна. */
  readonly delayMs: number;
}
