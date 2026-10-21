import {
  ReviewGrade,
  SchedulerConfig,
  SchedulingPreview,
  SchedulingState,
} from './interfaces';

export const MINUTE_MS = 60 * 1000;
export const DAY_MS = 24 * 60 * MINUTE_MS;

export const REVIEW_GRADES: readonly ReviewGrade[] = [
  'again',
  'hard',
  'good',
  'easy',
];

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  graduatingIntervalDays: 1,
  easyIntervalDays: 4,
  startingEase: 2.5,
  minEase: 1.3,
  easyBonus: 1.3,
  hardIntervalMultiplier: 1.2,
  lapseIntervalMultiplier: 0.5,
  maxIntervalDays: 365,
};

/** Начало локального дня для момента времени. */
export function startOfLocalDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function createInitialSchedulingState(
  now: number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG
): SchedulingState {
  return {
    state: 'new',
    step: 0,
    intervalDays: 0,
    easeFactor: config.startingEase,
    repetitions: 0,
    lapses: 0,
    dueAt: now,
    lastReviewedAt: null,
  };
}

export function isDue(state: SchedulingState, now: number): boolean {
  return state.dueAt <= now;
}

/**
 * Возвращает новое состояние планирования после оценки ответа.
 * Функция чистая: не изменяет исходное состояние.
 */
export function scheduleReview(
  state: SchedulingState,
  grade: ReviewGrade,
  now: number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG
): SchedulingState {
  switch (state.state) {
    case 'new':
    case 'learning':
      return scheduleLearning(state, grade, now, config);
    case 'relearning':
      return scheduleRelearning(state, grade, now, config);
    case 'review':
      return scheduleReviewed(state, grade, now, config);
  }
}

/** Предпросмотр: что произойдёт при каждой из оценок. */
export function previewSchedules(
  state: SchedulingState,
  now: number,
  config: SchedulerConfig = DEFAULT_SCHEDULER_CONFIG
): readonly SchedulingPreview[] {
  return REVIEW_GRADES.map((grade) => {
    const next = scheduleReview(state, grade, now, config);
    return { grade, next, delayMs: Math.max(0, next.dueAt - now) };
  });
}

function scheduleLearning(
  state: SchedulingState,
  grade: ReviewGrade,
  now: number,
  config: SchedulerConfig
): SchedulingState {
  const steps = config.learningStepsMinutes;
  const base: SchedulingState = { ...state, lastReviewedAt: now };

  switch (grade) {
    case 'again':
      return {
        ...base,
        state: 'learning',
        step: 0,
        dueAt: now + stepMinutes(steps, 0) * MINUTE_MS,
      };
    case 'hard': {
      const current = stepMinutes(steps, state.step);
      const next = stepMinutes(steps, state.step + 1);
      const delayMinutes =
        state.step === 0 && steps.length > 1 ? (current + next) / 2 : current * 1.5;
      return {
        ...base,
        state: 'learning',
        dueAt: now + delayMinutes * MINUTE_MS,
      };
    }
    case 'good': {
      const nextStep = state.step + 1;
      if (nextStep >= steps.length) {
        return graduate(base, config.graduatingIntervalDays, now, config);
      }
      return {
        ...base,
        state: 'learning',
        step: nextStep,
        dueAt: now + stepMinutes(steps, nextStep) * MINUTE_MS,
      };
    }
    case 'easy':
      return graduate(base, config.easyIntervalDays, now, config);
  }
}

function scheduleRelearning(
  state: SchedulingState,
  grade: ReviewGrade,
  now: number,
  config: SchedulerConfig
): SchedulingState {
  const steps = config.relearningStepsMinutes;
  const base: SchedulingState = { ...state, lastReviewedAt: now };

  switch (grade) {
    case 'again':
      return {
        ...base,
        step: 0,
        dueAt: now + stepMinutes(steps, 0) * MINUTE_MS,
      };
    case 'hard':
      return {
        ...base,
        dueAt: now + stepMinutes(steps, state.step) * 1.5 * MINUTE_MS,
      };
    case 'good': {
      const nextStep = state.step + 1;
      if (nextStep >= steps.length) {
        return graduate(base, Math.max(1, state.intervalDays), now, config);
      }
      return {
        ...base,
        step: nextStep,
        dueAt: now + stepMinutes(steps, nextStep) * MINUTE_MS,
      };
    }
    case 'easy':
      return graduate(base, Math.max(1, state.intervalDays) + 1, now, config);
  }
}

function scheduleReviewed(
  state: SchedulingState,
  grade: ReviewGrade,
  now: number,
  config: SchedulerConfig
): SchedulingState {
  const base: SchedulingState = { ...state, lastReviewedAt: now };
  const interval = Math.max(1, state.intervalDays);

  switch (grade) {
    case 'again':
      return {
        ...base,
        state: 'relearning',
        step: 0,
        repetitions: 0,
        lapses: state.lapses + 1,
        easeFactor: clampEase(state.easeFactor - 0.2, config),
        intervalDays: Math.max(
          1,
          Math.round(interval * config.lapseIntervalMultiplier)
        ),
        dueAt: now + stepMinutes(config.relearningStepsMinutes, 0) * MINUTE_MS,
      };
    case 'hard':
      return graduate(
        {
          ...base,
          easeFactor: clampEase(state.easeFactor - 0.15, config),
        },
        Math.max(interval + 1, interval * config.hardIntervalMultiplier),
        now,
        config
      );
    case 'good':
      return graduate(
        base,
        Math.max(interval + 1, interval * state.easeFactor),
        now,
        config
      );
    case 'easy':
      return graduate(
        {
          ...base,
          easeFactor: clampEase(state.easeFactor + 0.15, config),
        },
        Math.max(interval + 1, interval * state.easeFactor * config.easyBonus),
        now,
        config
      );
  }
}

/** Переводит карточку в review с заданным интервалом (в днях). */
function graduate(
  state: SchedulingState,
  intervalDays: number,
  now: number,
  config: SchedulerConfig
): SchedulingState {
  const days = Math.min(config.maxIntervalDays, Math.max(1, Math.round(intervalDays)));
  return {
    ...state,
    state: 'review',
    step: 0,
    intervalDays: days,
    repetitions: state.repetitions + 1,
    dueAt: startOfLocalDay(now + days * DAY_MS),
  };
}

function stepMinutes(steps: readonly number[], index: number): number {
  if (steps.length === 0) {
    return 1;
  }
  const safeIndex = Math.min(Math.max(index, 0), steps.length - 1);
  return steps[safeIndex];
}

function clampEase(value: number, config: SchedulerConfig): number {
  return Math.round(Math.max(config.minEase, value) * 100) / 100;
}
