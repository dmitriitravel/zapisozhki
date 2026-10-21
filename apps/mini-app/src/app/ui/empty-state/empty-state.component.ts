import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { IconName } from '../icon/icons';

@Component({
  selector: 'memo-empty-state',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <memo-icon class="empty__icon" [name]="icon()" [size]="72" />
      <h2 class="empty__title">{{ title() }}</h2>
      <div class="empty__hints">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 48px 24px;
      gap: 12px;
    }
    .empty__icon {
      color: var(--memo-text);
      opacity: 0.85;
    }
    .empty__title {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
    }
    .empty__hints {
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: var(--memo-hint);
      font-size: 15px;
    }
  `,
})
export class EmptyStateComponent {
  readonly icon = input<IconName>('package-open');
  readonly title = input.required<string>();
}
