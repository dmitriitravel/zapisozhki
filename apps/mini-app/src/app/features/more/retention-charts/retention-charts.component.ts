import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RetentionPoint } from '../../../core/models/interfaces';
import {
  RETENTION_HORIZON_DAYS,
  REVIEW_DAYS,
  forgettingCurve,
  spacedRepetitionCurve,
} from '../../../core/stats/retention';
import { ChartMark, RetentionChartGeometry } from '../interfaces';

const WIDTH = 320;
const HEIGHT = 150;
const PADDING_LEFT = 30;
const PADDING_RIGHT = 10;
const PADDING_TOP = 10;
const PADDING_BOTTOM = 24;

/**
 * Иллюстрация метода: кривая забывания Эббингауза и как интервальные повторения
 * возвращают память к 100 % и замедляют забывание (аналог ChartsView в Mac-версии).
 */
@Component({
  selector: 'memo-retention-charts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './retention-charts.component.html',
  styleUrl: './retention-charts.component.scss',
})
export class RetentionChartsComponent {
  readonly forgetting = buildGeometry([forgettingCurve()], true, []);
  readonly spaced = buildGeometry(
    spacedRepetitionCurve().map((segment) => segment.points),
    false,
    REVIEW_DAYS
  );
  readonly reviewPoints = REVIEW_DAYS.map((day) => ({
    x: scaleX(day),
    y: scaleY(100),
  }));
}

function scaleX(day: number): number {
  const inner = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  return round(PADDING_LEFT + (day / RETENTION_HORIZON_DAYS) * inner);
}

function scaleY(retention: number): number {
  const inner = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  return round(PADDING_TOP + (1 - retention / 100) * inner);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function toPath(points: readonly RetentionPoint[]): string {
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${scaleX(point.day)},${scaleY(point.retention)}`)
    .join(' ');
}

function buildGeometry(
  series: readonly (readonly RetentionPoint[])[],
  withArea: boolean,
  markDays: readonly number[]
): RetentionChartGeometry {
  const lines = series.map(toPath);
  const first = series[0] ?? [];
  const area =
    withArea && first.length > 0
      ? `${toPath(first)} L${scaleX(first[first.length - 1].day)},${scaleY(0)} L${scaleX(first[0].day)},${scaleY(0)} Z`
      : null;
  const marks: readonly ChartMark[] = markDays.map((day, index) => ({
    x: scaleX(day),
    label: `${index + 1}-е`,
  }));
  return {
    width: WIDTH,
    height: HEIGHT,
    lines,
    area,
    xTicks: REVIEW_DAYS.map((day) => ({ position: scaleX(day), label: `${day}` })),
    yTicks: [0, 50, 100].map((value) => ({ position: scaleY(value), label: `${value}%` })),
    marks,
  };
}
