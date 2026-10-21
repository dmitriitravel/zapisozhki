export const NEW_CARDS_PER_DAY_MIN = 0;
export const NEW_CARDS_PER_DAY_MAX = 200;
export const NEW_CARDS_PER_DAY_STEP = 5;
export const USER_NAME_MAX_LENGTH = 40;

/** Фраза для проверки озвучки (как в Mac-версии). */
export const SPEECH_TEST_PHRASE = 'Staying in that fancy hotel costs an arm and a leg.';

export type BackupOperation = 'cloud-save' | 'cloud-restore' | 'export' | 'import' | null;

export type StatTileTone = 'accent' | 'success' | 'warning' | 'info';

/** Столбик графика активности. */
export interface ActivityBar {
  readonly day: number;
  readonly count: number;
  /** Высота в процентах от максимума. */
  readonly height: number;
  readonly label: string;
  readonly isToday: boolean;
}

/** Геометрия SVG-графика кривой запоминания. */
export interface RetentionChartGeometry {
  readonly width: number;
  readonly height: number;
  /** Линии (одна — кривая забывания, несколько — сегменты интервального повторения). */
  readonly lines: readonly string[];
  /** Заливка под кривой (только для кривой забывания). */
  readonly area: string | null;
  readonly xTicks: readonly ChartTick[];
  readonly yTicks: readonly ChartTick[];
  /** Вертикальные отметки повторений с подписями. */
  readonly marks: readonly ChartMark[];
}

export interface ChartTick {
  readonly position: number;
  readonly label: string;
}

export interface ChartMark {
  readonly x: number;
  readonly label: string;
}
