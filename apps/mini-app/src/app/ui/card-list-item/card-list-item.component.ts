import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Card } from '../../core/models/interfaces';
import { IconComponent } from '../icon/icon.component';

/** Строка списка карточек: превью, вопрос, ответ и кнопка меню. */
@Component({
  selector: 'memo-card-list-item',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="item" (click)="open.emit(card())">
      <div class="item__thumb">
        @if (card().thumbnailDataUrl; as thumb) {
          <img class="item__img" [src]="thumb" alt="" loading="lazy" />
        } @else {
          <span class="item__placeholder">{{ initial() }}</span>
        }
      </div>
      <div class="item__body">
        <div class="item__question">{{ card().question }}</div>
        <div class="item__answer">{{ card().answer }}</div>
      </div>
      <button
        type="button"
        class="memo-icon-btn item__menu"
        aria-label="Действия"
        (click)="onMenu($event)"
      >
        <memo-icon name="more-horizontal" [size]="22" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .item {
      display: grid;
      grid-template-columns: 56px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 10px 8px 10px 16px;
      cursor: pointer;
    }
    .item:active {
      background: var(--memo-secondary-bg);
    }
    .item__thumb {
      width: 56px;
      height: 56px;
      border-radius: 10px;
      overflow: hidden;
      background: var(--memo-secondary-bg);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .item__img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .item__placeholder {
      font-size: 22px;
      font-weight: 600;
      color: var(--memo-hint);
    }
    .item__body {
      min-width: 0;
    }
    .item__question,
    .item__answer {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .item__question {
      font-weight: 600;
      font-size: 15px;
    }
    .item__answer {
      color: var(--memo-hint);
      font-size: 14px;
      margin-top: 2px;
    }
    .item__menu {
      color: var(--memo-hint);
    }
  `,
})
export class CardListItemComponent {
  readonly card = input.required<Card>();
  readonly open = output<Card>();
  readonly menu = output<Card>();

  initial(): string {
    return this.card().question.trim().charAt(0).toUpperCase() || '?';
  }

  onMenu(event: Event): void {
    event.stopPropagation();
    this.menu.emit(this.card());
  }
}
