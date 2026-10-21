import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { Card } from '../../../core/models/interfaces';
import { SpeechService } from '../../../core/speech/speech.service';
import { MemoStore } from '../../../core/store/memo-store.service';
import { StudySession } from '../../../core/study/study-session.service';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { StudyCardComponent } from '../../../ui/study-card/study-card.component';
import { IDLE_SWIPE, SwipeState } from '../interfaces';

const MEMO_SWIPE_THRESHOLD_PX = 60;

/**
 * Режим Memo: обе стороны карточки видны сразу, без оценок.
 * Листание кнопками или горизонтальным свайпом, по кругу.
 */
@Component({
  selector: 'memo-memo-view',
  standalone: true,
  imports: [RouterLink, IconComponent, StudyCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './memo-view.component.html',
  styleUrl: './memo-view.component.scss',
})
export class MemoViewComponent {
  readonly menu = output<Card>();
  readonly speak = output<Card>();
  readonly addCard = output<void>();

  readonly session = inject(StudySession);

  private readonly store = inject(MemoStore);
  private readonly speech = inject(SpeechService);
  private readonly telegram = inject(TelegramService);

  private readonly swipeState = signal<SwipeState>(IDLE_SWIPE);

  readonly hasAnyCards = computed(() => this.store.cards().length > 0);
  readonly total = computed(() => this.session.memoCards().length);
  readonly isSpeaking = computed(() => {
    const card = this.session.memoCurrent();
    return card !== null && this.speech.speakingText() === card.question.trim();
  });
  readonly cardTransform = computed(() => {
    const { deltaX, active } = this.swipeState();
    return active && deltaX !== 0 ? `translateX(${deltaX * 0.4}px)` : '';
  });

  next(): void {
    this.telegram.hapticSelection();
    this.speech.stop();
    this.session.memoNext();
  }

  previous(): void {
    this.telegram.hapticSelection();
    this.speech.stop();
    this.session.memoPrevious();
  }

  onPointerDown(event: PointerEvent): void {
    this.swipeState.set({
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
      deltaY: 0,
      active: true,
    });
  }

  onPointerMove(event: PointerEvent): void {
    const swipe = this.swipeState();
    if (!swipe.active) {
      return;
    }
    const deltaX = event.clientX - swipe.startX;
    const deltaY = event.clientY - swipe.startY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }
    this.swipeState.set({ ...swipe, deltaX, deltaY });
  }

  onPointerUp(): void {
    const swipe = this.swipeState();
    this.swipeState.set(IDLE_SWIPE);
    if (!swipe.active || this.total() < 2) {
      return;
    }
    if (swipe.deltaX <= -MEMO_SWIPE_THRESHOLD_PX) {
      this.next();
    } else if (swipe.deltaX >= MEMO_SWIPE_THRESHOLD_PX) {
      this.previous();
    }
  }
}
