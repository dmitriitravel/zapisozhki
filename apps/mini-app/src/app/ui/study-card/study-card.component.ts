import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { Card } from '../../core/models/interfaces';
import { CardImageComponent } from '../card-image/card-image.component';
import { IconComponent } from '../icon/icon.component';
import { StudyCardSide } from '../interfaces';

/**
 * Содержимое учебной карточки (как StudyCardView в Mac-версии).
 * Лицевая сторона: только изображение (если включено и оно есть) либо изображение + вопрос.
 * Обратная: уменьшенное изображение, вопрос, разделитель, ответ, кнопки «…» и динамик.
 */
@Component({
  selector: 'memo-study-card',
  standalone: true,
  imports: [CardImageComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="face" [class.face--back]="side() !== 'front'">
      @if (side() === 'front') {
        @if (card().imageId; as imageId) {
          <memo-card-image
            class="front-image"
            [class.front-image--only]="isImageOnly()"
            [imageId]="imageId"
            [fit]="isImageOnly() ? 'cover' : 'contain'"
          />
        }
        @if (!isImageOnly()) {
          <p class="question">{{ card().question }}</p>
        }
        @if (showHint()) {
          <span class="hint">Нажмите, чтобы увидеть ответ</span>
        }
      } @else {
        <div class="back">
          @if (card().imageId; as imageId) {
            <memo-card-image class="back-image" [imageId]="imageId" />
          }
          <p class="question question--back">{{ card().question }}</p>
          <div class="divider"></div>
          @if (card().answer) {
            <p class="answer">{{ card().answer }}</p>
          }
        </div>
        <div class="actions">
          <button
            type="button"
            class="memo-icon-btn memo-icon-btn--muted"
            aria-label="Действия с карточкой"
            (click)="onMenu($event)"
          >
            <memo-icon name="more-horizontal" [size]="22" />
          </button>
          <button
            type="button"
            class="memo-icon-btn memo-icon-btn--muted"
            [class.speaking]="speaking()"
            aria-label="Озвучить вопрос"
            (click)="onSpeak($event)"
          >
            <memo-icon [name]="speaking() ? 'volume-active' : 'volume'" [size]="22" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .face {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      width: 100%;
      height: 100%;
      padding: 22px 20px;
      text-align: center;
      overflow: hidden;
    }
    .face--back {
      justify-content: flex-start;
      padding-bottom: 76px;
    }
    .front-image {
      width: 100%;
      flex: 0 1 46%;
      min-height: 120px;
    }
    .front-image--only {
      position: absolute;
      inset: 0;
      flex: none;
      min-height: 0;
      border-radius: 0;
    }
    .back {
      display: flex;
      flex: 1;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      width: 100%;
      min-height: 0;
      overflow-y: auto;
    }
    .back-image {
      width: 100%;
      flex: 0 0 auto;
      height: 150px;
    }
    .question {
      margin: 0;
      font-size: 22px;
      font-weight: 600;
      line-height: 1.3;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .question--back {
      font-size: 20px;
      font-weight: 700;
    }
    .divider {
      width: 48px;
      height: 3px;
      border-radius: 2px;
      background: var(--memo-accent);
      flex-shrink: 0;
    }
    .answer {
      margin: 0;
      font-size: 16px;
      line-height: 1.45;
      color: var(--memo-hint);
      white-space: pre-wrap;
      word-break: break-word;
    }
    .hint {
      position: absolute;
      bottom: 14px;
      left: 0;
      right: 0;
      font-size: 12px;
      color: var(--memo-hint);
    }
    .actions {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 16px;
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    .speaking {
      color: var(--memo-accent);
    }
  `,
})
export class StudyCardComponent {
  readonly card = input.required<Card>();
  readonly side = input<StudyCardSide>('front');
  readonly imageOnlyFront = input<boolean>(true);
  readonly showHint = input<boolean>(true);
  readonly speaking = input<boolean>(false);

  readonly speak = output<Card>();
  readonly menu = output<Card>();

  readonly isImageOnly = computed(
    () => this.imageOnlyFront() && this.card().imageId !== null
  );

  onSpeak(event: Event): void {
    event.stopPropagation();
    this.speak.emit(this.card());
  }

  onMenu(event: Event): void {
    event.stopPropagation();
    this.menu.emit(this.card());
  }
}
