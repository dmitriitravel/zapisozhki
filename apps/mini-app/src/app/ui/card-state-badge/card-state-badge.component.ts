import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CardStateLabel } from '../../core/study/interfaces';

/** Бейдж состояния карточки: «Новая», «Учится · 5 мин», «К повторению», «Через 3 дн». */
@Component({
  selector: 'memo-card-state-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="memo-badge"
      [class.memo-badge--info]="state().tone === 'info'"
      [class.memo-badge--warning]="state().tone === 'warning'"
      [class.memo-badge--accent]="state().tone === 'accent'"
    >
      {{ state().text }}
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class CardStateBadgeComponent {
  readonly state = input.required<CardStateLabel>();
}
