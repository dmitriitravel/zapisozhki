import { ReviewGrade } from '@memo/shared/spaced-repetition';

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
