import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Card } from '../../core/models/interfaces';
import { CardStateLabel } from '../../core/study/interfaces';
import { CardStateBadgeComponent } from '../card-state-badge/card-state-badge.component';
import { IconComponent } from '../icon/icon.component';

/** Строка списка карточек: превью, вопрос, ответ, бейдж состояния, динамик и меню. */
@Component({
  selector: 'memo-card-list-item',
  standalone: true,
  imports: [IconComponent, CardStateBadgeComponent],
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
        @if (card().answer) {
          <div class="item__answer">{{ card().answer }}</div>
        }
        @if (state(); as state) {
          <div class="item__state">
            <memo-card-state-badge [state]="state" />
          </div>
        }
      </div>
      <div class="item__actions">
        @if (showSpeaker()) {
          <button
            type="button"
            class="memo-icon-btn memo-icon-btn--small item__speaker"
            [class.item__speaker--active]="speaking()"
            aria-label="Озвучить"
            (click)="onSpeak($event)"
          >
            <memo-icon [name]="speaking() ? 'volume-active' : 'volume'" [size]="20" />
          </button>
        }
        <button
          type="button"
          class="memo-icon-btn memo-icon-btn--small item__menu"
          aria-label="Действия"
          (click)="onMenu($event)"
        >
          <memo-icon name="more-horizontal" [size]="22" />
        </button>
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .item {
      display: grid;
      grid-template-columns: 60px 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 10px 8px 10px 16px;
      cursor: pointer;
    }
    .item:active {
      background: var(--memo-secondary-bg);
    }
    .item__thumb {
      width: 60px;
      height: 60px;
      border-radius: 12px;
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
      display: flex;
      flex-direction: column;
      gap: 2px;
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
    }
    .item__state {
      margin-top: 2px;
    }
    .item__actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .item__speaker,
    .item__menu {
      color: var(--memo-hint);
    }
    .item__speaker--active {
      color: var(--memo-accent);
    }
  `,
})
export class CardListItemComponent {
  readonly card = input.required<Card>();
  readonly state = input<CardStateLabel | null>(null);
  readonly showSpeaker = input<boolean>(false);
  readonly speaking = input<boolean>(false);

  readonly open = output<Card>();
  readonly menu = output<Card>();
  readonly speak = output<Card>();

  initial(): string {
    return this.card().question.trim().charAt(0).toUpperCase() || '?';
  }

  onMenu(event: Event): void {
    event.stopPropagation();
    this.menu.emit(this.card());
  }

  onSpeak(event: Event): void {
    event.stopPropagation();
    this.speak.emit(this.card());
  }
}
