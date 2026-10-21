import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/**
 * Нижняя шторка с произвольным содержимым (Drilling list и т.п.).
 * Слоты: [header] — элементы под заголовком (например, сегментированный переключатель),
 * содержимое по умолчанию — прокручиваемая область.
 */
@Component({
  selector: 'memo-bottom-sheet',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="sheet" role="dialog" [attr.aria-label]="title()">
      <div class="sheet__grabber"></div>
      <div class="sheet__top">
        <h2 class="sheet__title">{{ title() }}</h2>
        <button type="button" class="memo-icon-btn memo-icon-btn--muted" aria-label="Закрыть" (click)="closed.emit()">
          <memo-icon name="chevron-down" [size]="22" />
        </button>
      </div>
      <div class="sheet__header">
        <ng-content select="[header]" />
      </div>
      <div class="sheet__content">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 30;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: rgba(0, 0, 0, 0.4);
      animation: fade 0.15s ease-out;
    }
    .sheet {
      position: relative;
      display: flex;
      flex-direction: column;
      max-height: 88vh;
      max-height: 88dvh;
      background: var(--memo-bg);
      border-radius: 24px 24px 0 0;
      padding: 8px 16px calc(12px + var(--memo-safe-bottom));
      animation: slide 0.22s ease-out;
    }
    .sheet__grabber {
      align-self: center;
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background: var(--memo-divider);
      margin-bottom: 8px;
    }
    .sheet__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 4px 0 12px;
    }
    .sheet__title {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
    }
    .sheet__header:empty {
      display: none;
    }
    .sheet__content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding-top: 12px;
    }
    @keyframes fade {
      from {
        opacity: 0;
      }
    }
    @keyframes slide {
      from {
        transform: translateY(100%);
      }
    }
  `,
})
export class BottomSheetComponent {
  readonly title = input<string>('');
  readonly closed = output<void>();
}
