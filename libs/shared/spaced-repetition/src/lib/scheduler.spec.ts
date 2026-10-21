import {
  createInitialSchedulingState,
  DAY_MS,
  DEFAULT_SCHEDULER_CONFIG,
  isDue,
  MINUTE_MS,
  previewSchedules,
  scheduleReview,
  startOfLocalDay,
} from './scheduler';
import { SchedulingState } from './interfaces';

const NOW = new Date(2026, 0, 15, 12, 0, 0).getTime();

describe('scheduler', () => {
  it('creates a new card that is due immediately', () => {
    const state = createInitialSchedulingState(NOW);

    expect(state.state).toBe('new');
    expect(state.easeFactor).toBe(DEFAULT_SCHEDULER_CONFIG.startingEase);
    expect(isDue(state, NOW)).toBe(true);
  });

  it('moves a new card through learning steps on "good"', () => {
    const initial = createInitialSchedulingState(NOW);

    const afterFirst = scheduleReview(initial, 'good', NOW);
    expect(afterFirst.state).toBe('learning');
    expect(afterFirst.step).toBe(1);
    expect(afterFirst.dueAt).toBe(NOW + 10 * MINUTE_MS);

    const later = afterFirst.dueAt;
    const afterSecond = scheduleReview(afterFirst, 'good', later);
    expect(afterSecond.state).toBe('review');
    expect(afterSecond.intervalDays).toBe(1);
    expect(afterSecond.repetitions).toBe(1);
    expect(afterSecond.dueAt).toBe(startOfLocalDay(later + DAY_MS));
  });

  it('resets learning step on "again"', () => {
    const initial = createInitialSchedulingState(NOW);
    const afterGood = scheduleReview(initial, 'good', NOW);

    const afterAgain = scheduleReview(afterGood, 'again', NOW + MINUTE_MS);

    expect(afterAgain.state).toBe('learning');
    expect(afterAgain.step).toBe(0);
    expect(afterAgain.dueAt).toBe(NOW + 2 * MINUTE_MS);
  });

  it('graduates immediately on "easy"', () => {
    const initial = createInitialSchedulingState(NOW);

    const result = scheduleReview(initial, 'easy', NOW);

    expect(result.state).toBe('review');
    expect(result.intervalDays).toBe(DEFAULT_SCHEDULER_CONFIG.easyIntervalDays);
  });

  it('grows the interval by the ease factor on review "good"', () => {
    const reviewState: SchedulingState = {
      ...createInitialSchedulingState(NOW),
      state: 'review',
      intervalDays: 10,
      repetitions: 3,
    };

    const result = scheduleReview(reviewState, 'good', NOW);

    expect(result.intervalDays).toBe(25);
    expect(result.easeFactor).toBe(2.5);
    expect(result.repetitions).toBe(4);
  });

  it('adjusts ease on "hard" and "easy" in review', () => {
    const reviewState: SchedulingState = {
      ...createInitialSchedulingState(NOW),
      state: 'review',
      intervalDays: 10,
    };

    const hard = scheduleReview(reviewState, 'hard', NOW);
    expect(hard.easeFactor).toBe(2.35);
    expect(hard.intervalDays).toBe(12);

    const easy = scheduleReview(reviewState, 'easy', NOW);
    expect(easy.easeFactor).toBe(2.65);
    expect(easy.intervalDays).toBe(33);
  });

  it('sends a forgotten review card to relearning and reduces interval', () => {
    const reviewState: SchedulingState = {
      ...createInitialSchedulingState(NOW),
      state: 'review',
      intervalDays: 20,
      repetitions: 5,
    };

    const lapsed = scheduleReview(reviewState, 'again', NOW);

    expect(lapsed.state).toBe('relearning');
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.easeFactor).toBe(2.3);
    expect(lapsed.intervalDays).toBe(10);
    expect(lapsed.dueAt).toBe(NOW + 10 * MINUTE_MS);

    const recovered = scheduleReview(lapsed, 'good', lapsed.dueAt);
    expect(recovered.state).toBe('review');
    expect(recovered.intervalDays).toBe(10);
  });

  it('never lets ease drop below the minimum', () => {
    const reviewState: SchedulingState = {
      ...createInitialSchedulingState(NOW),
      state: 'review',
      intervalDays: 5,
      easeFactor: 1.35,
    };

    const result = scheduleReview(reviewState, 'again', NOW);

    expect(result.easeFactor).toBe(DEFAULT_SCHEDULER_CONFIG.minEase);
  });

  it('caps the interval at the configured maximum', () => {
    const reviewState: SchedulingState = {
      ...createInitialSchedulingState(NOW),
      state: 'review',
      intervalDays: 300,
    };

    const result = scheduleReview(reviewState, 'easy', NOW);

    expect(result.intervalDays).toBe(DEFAULT_SCHEDULER_CONFIG.maxIntervalDays);
  });

  it('does not mutate the input state', () => {
    const initial = createInitialSchedulingState(NOW);
    const snapshot = { ...initial };

    scheduleReview(initial, 'good', NOW);

    expect(initial).toEqual(snapshot);
  });

  it('returns a preview for every grade', () => {
    const previews = previewSchedules(createInitialSchedulingState(NOW), NOW);

    expect(previews.map((p) => p.grade)).toEqual([
      'again',
      'hard',
      'good',
      'easy',
    ]);
    expect(previews[0].delayMs).toBe(MINUTE_MS);
    expect(previews[2].delayMs).toBe(10 * MINUTE_MS);
  });
});
