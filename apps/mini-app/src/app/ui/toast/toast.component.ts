import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/toast/toast.service';

@Component({
  selector: 'memo-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite">
      @for (message of toast.messages(); track message.id) {
        <div
          class="toast"
          [class.toast--success]="message.kind === 'success'"
          [class.toast--error]="message.kind === 'error'"
          (click)="toast.dismiss(message.id)"
        >
          {{ message.text }}
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: calc(var(--memo-tab-bar-height) + var(--memo-safe-bottom) + 16px);
      z-index: 50;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      align-self: center;
      padding: 10px 16px;
      border-radius: 12px;
      background: rgba(30, 30, 30, 0.92);
      color: #fff;
      font-size: 14px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
      animation: pop 0.2s ease-out;
    }
    .toast--success {
      background: rgba(39, 139, 84, 0.95);
    }
    .toast--error {
      background: rgba(214, 69, 65, 0.95);
    }
    @keyframes pop {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
    }
  `,
})
export class ToastComponent {
  readonly toast = inject(ToastService);
}
