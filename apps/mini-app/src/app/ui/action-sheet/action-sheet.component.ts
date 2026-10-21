import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { ActionSheetOption } from '../interfaces';

/** Нижняя шторка с набором действий (аналог iOS action sheet). */
@Component({
  selector: 'memo-action-sheet',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="backdrop" (click)="closed.emit()"></div>
    <div class="sheet" role="dialog" [attr.aria-label]="title()">
      @if (title()) {
        <div class="sheet__title">{{ title() }}</div>
      }
      <div class="sheet__list">
        @for (option of options(); track option.id) {
          <button
            type="button"
            class="sheet__option"
            [class.sheet__option--destructive]="option.destructive"
            [class.sheet__option--selected]="option.selected"
            (click)="selected.emit(option.id)"
          >
            @if (option.icon) {
              <memo-icon [name]="option.icon" [size]="20" />
            }
            <span class="sheet__label">{{ option.label }}</span>
            @if (option.selected) {
              <memo-icon name="check" [size]="20" class="sheet__check" />
            }
          </button>
        }
      </div>
      <button type="button" class="sheet__cancel" (click)="closed.emit()">
        Отмена
      </button>
    </div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: 40;
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
      background: var(--memo-section-bg);
      border-radius: 20px 20px 0 0;
      padding: 8px 12px calc(12px + var(--memo-safe-bottom));
      animation: slide 0.2s ease-out;
      max-height: 80vh;
      overflow-y: auto;
    }
    .sheet__title {
      text-align: center;
      font-weight: 600;
      padding: 12px 0 8px;
    }
    .sheet__list {
      display: flex;
      flex-direction: column;
    }
    .sheet__option {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 14px 12px;
      border: 0;
      background: transparent;
      color: var(--memo-text);
      font-size: 16px;
      text-align: left;
      border-radius: 12px;
      cursor: pointer;
    }
    .sheet__option:active {
      background: var(--memo-secondary-bg);
    }
    .sheet__option--destructive {
      color: var(--memo-destructive);
    }
    .sheet__option--selected {
      color: var(--memo-accent);
    }
    .sheet__label {
      flex: 1;
    }
    .sheet__cancel {
      width: 100%;
      margin-top: 8px;
      padding: 14px;
      border: 0;
      border-radius: 12px;
      background: var(--memo-secondary-bg);
      color: var(--memo-text);
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
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
export class ActionSheetComponent {
  readonly title = input<string>('');
  readonly options = input.required<readonly ActionSheetOption[]>();
  readonly selected = output<string>();
  readonly closed = output<void>();
}
