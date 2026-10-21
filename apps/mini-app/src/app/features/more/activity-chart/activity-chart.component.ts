import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { startOfLocalDay } from '@memo/shared/spaced-repetition';
import { DailyReviewPoint } from '../../../core/models/interfaces';
import { formatWeekday } from '../../../core/utils/format';
import { ActivityBar } from '../interfaces';

/** Столбики повторений за последние две недели. */
@Component({
  selector: 'memo-activity-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart memo-card">
      <div class="chart__head">
        <span class="chart__title">Активность за 14 дней</span>
        <span class="chart__total memo-hint">{{ total() }} повт.</span>
      </div>
      <div class="bars">
        @for (bar of bars(); track bar.day) {
          <div class="bar" [class.bar--today]="bar.isToday" [title]="bar.count + ' повторений'">
            <span class="bar__count" [class.bar__count--hidden]="bar.count === 0">{{ bar.count }}</span>
            <div class="bar__track">
              <div class="bar__fill" [style.height.%]="bar.height"></div>
            </div>
            <span class="bar__label">{{ bar.label }}</span>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .chart {
      padding: 14px 14px 10px;
    }
    .chart__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 10px;
    }
    .chart__title {
      font-size: 15px;
      font-weight: 700;
    }
    .chart__total {
      font-size: 13px;
    }
    .bars {
      display: grid;
      grid-template-columns: repeat(14, 1fr);
      gap: 4px;
      align-items: end;
    }
    .bar {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .bar__count {
      font-size: 9px;
      color: var(--memo-hint);
      line-height: 1;
    }
    .bar__count--hidden {
      visibility: hidden;
    }
    .bar__track {
      display: flex;
      align-items: flex-end;
      width: 100%;
      height: 72px;
      border-radius: 6px;
      background: var(--memo-secondary-bg);
      overflow: hidden;
    }
    .bar__fill {
      width: 100%;
      min-height: 0;
      border-radius: 6px;
      background: var(--memo-accent);
      transition: height 0.3s ease;
    }
    .bar--today .bar__fill {
      background: var(--memo-navy);
    }
    .bar__label {
      font-size: 9px;
      color: var(--memo-hint);
      text-transform: lowercase;
    }
    .bar--today .bar__label {
      color: var(--memo-text);
      font-weight: 700;
    }
  `,
})
export class ActivityChartComponent {
  readonly points = input.required<readonly DailyReviewPoint[]>();

  readonly total = computed(() =>
    this.points().reduce((sum, point) => sum + point.count, 0)
  );

  readonly bars = computed<readonly ActivityBar[]>(() => {
    const points = this.points();
    const max = Math.max(1, ...points.map((point) => point.count));
    const today = startOfLocalDay(Date.now());
    return points.map((point) => ({
      day: point.day,
      count: point.count,
      height: point.count === 0 ? 0 : Math.max(8, Math.round((point.count / max) * 100)),
      label: formatWeekday(point.day),
      isToday: point.day === today,
    }));
  });
}
