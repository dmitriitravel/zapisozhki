import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReviewGrade } from '@memo/shared/spaced-repetition';
import { TelegramService } from '@memo/shared/telegram';
import { Card } from '../../../core/models/interfaces';
import { SpeechService } from '../../../core/speech/speech.service';
import { MemoStore } from '../../../core/store/memo-store.service';
import { StudySession } from '../../../core/study/study-session.service';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { StudyCardComponent } from '../../../ui/study-card/study-card.component';
import {
  FlyAwayDirection,
  IDLE_SWIPE,
  SwipeDirection,
  SwipeState,
} from '../interfaces';

const SWIPE_THRESHOLD_PX = 90;
const SWIPE_MAX_ROTATION_DEG = 12;
const SWIPE_VERTICAL_FACTOR = 0.15;
const FLY_AWAY_MS = 180;
const FLY_AWAY_DISTANCE_FACTOR = 1.4;

/**
 * Режим Dremo: стопка карточек, переворот по нажатию, оценка кнопками или свайпом
 * со штампами «ЕСТЬ» / «ЕЩЁ РАЗ», экраны ожидания и завершения сессии.
 */
@Component({
  selector: 'memo-study-session',
  standalone: true,
  imports: [RouterLink, IconComponent, StudyCardComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-session.component.html',
  styleUrl: './study-session.component.scss',
})
export class StudySessionComponent {
  readonly menu = output<Card>();
  readonly speak = output<Card>();
  readonly addCard = output<void>();

  readonly session = inject(StudySession);

  private readonly store = inject(MemoStore);
  private readonly speech = inject(SpeechService);
  private readonly router = inject(Router);
  private readonly telegram = inject(TelegramService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly swipeState = signal<SwipeState>(IDLE_SWIPE);
  private readonly flyState = signal<FlyAwayDirection>(null);
  private readonly ratingState = signal(false);
  private readonly stageWidthState = signal(360);
  private suppressNextClick = false;

  readonly swipe = this.swipeState.asReadonly();
  readonly flyAway = this.flyState.asReadonly();

  readonly hasAnyCards = computed(() => this.store.cards().length > 0);
  readonly hasScopedCards = computed(() => this.session.scopedCards().length > 0);
  readonly imageOnlyFront = computed(() => this.store.settings().imageOnlyFront);
  readonly swipeEnabled = computed(() => this.store.settings().swipeToRate);
  readonly isSpeaking = computed(() => {
    const card = this.session.current();
    return card !== null && this.speech.speakingText() === card.question.trim();
  });

  readonly swipeDirection = computed<SwipeDirection>(() => {
    const delta = this.swipeState().deltaX;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) {
      return null;
    }
    return delta < 0 ? 'left' : 'right';
  });

  /** Прозрачность штампов пропорциональна сдвигу карточки. */
  readonly rightStampOpacity = computed(() => this.stampOpacity('right'));
  readonly leftStampOpacity = computed(() => this.stampOpacity('left'));

  readonly cardTransform = computed(() => {
    const fly = this.flyState();
    if (fly) {
      const distance = this.stageWidthState() * FLY_AWAY_DISTANCE_FACTOR;
      const sign = fly === 'right' ? 1 : -1;
      return `translateX(${sign * distance}px) rotate(${sign * 20}deg)`;
    }
    const { deltaX, deltaY, active } = this.swipeState();
    if (!active && deltaX === 0) {
      return '';
    }
    const rotation = Math.max(
      -SWIPE_MAX_ROTATION_DEG,
      Math.min(SWIPE_MAX_ROTATION_DEG, deltaX / 12)
    );
    return `translate(${deltaX}px, ${deltaY * SWIPE_VERTICAL_FACTOR}px) rotate(${rotation}deg)`;
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.speech.stop());
  }

  flip(): void {
    if (this.suppressNextClick) {
      // Клик, который браузер генерирует после свайпа, не должен переворачивать следующую карточку.
      this.suppressNextClick = false;
      return;
    }
    const card = this.session.current();
    if (!card || this.session.isFlipped()) {
      return;
    }
    this.telegram.hapticImpact('light');
    this.session.flip();
    if (this.store.settings().autoSpeak) {
      this.speech.speak(card.question);
    }
  }

  async rate(grade: ReviewGrade): Promise<void> {
    if (this.ratingState() || this.session.current() === null) {
      return;
    }
    this.ratingState.set(true);
    try {
      this.speech.stop();
      await this.session.rate(grade);
      this.swipeState.set(IDLE_SWIPE);
      this.flyState.set(null);
      this.telegram.hapticNotification(grade === 'again' ? 'warning' : 'success');
    } finally {
      this.ratingState.set(false);
    }
  }

  showNow(): void {
    this.telegram.hapticImpact('light');
    this.session.showNow();
  }

  restart(): void {
    this.telegram.hapticImpact('medium');
    this.session.start();
  }

  repeatAll(): void {
    this.telegram.hapticImpact('medium');
    this.session.startAll();
  }

  switchToMemo(): void {
    this.session.setMode('memo');
    void this.router.navigate([], {
      queryParams: { mode: 'memo' },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  onPointerDown(event: PointerEvent): void {
    // Новое касание — предыдущий «подавленный» клик уже не актуален.
    this.suppressNextClick = false;
    if (!this.swipeEnabled() || !this.session.isFlipped() || this.flyState()) {
      return;
    }
    const target = event.currentTarget;
    if (target instanceof HTMLElement) {
      this.stageWidthState.set(target.getBoundingClientRect().width || 360);
      capturePointer(target, event.pointerId);
    }
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
    // Вертикальное движение — прокрутка, не свайп.
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaX) < 10) {
      return;
    }
    this.swipeState.set({ ...swipe, deltaX, deltaY });
  }

  onPointerUp(): void {
    const swipe = this.swipeState();
    if (!swipe.active) {
      return;
    }
    const direction = this.swipeDirection();
    this.suppressNextClick = Math.abs(swipe.deltaX) > 10;
    if (!direction) {
      this.swipeState.set(IDLE_SWIPE);
      return;
    }
    // Карточка «улетает» в сторону, после чего ставится оценка.
    this.swipeState.set({ ...swipe, active: false });
    this.flyState.set(direction);
    this.telegram.hapticImpact('medium');
    setTimeout(() => {
      void this.rate(direction === 'right' ? 'good' : 'again');
    }, FLY_AWAY_MS);
  }

  private stampOpacity(side: 'left' | 'right'): number {
    const fly = this.flyState();
    if (fly) {
      return fly === side ? 1 : 0;
    }
    const delta = this.swipeState().deltaX;
    const matches = side === 'right' ? delta > 0 : delta < 0;
    if (!matches) {
      return 0;
    }
    return Math.min(1, Math.abs(delta) / SWIPE_THRESHOLD_PX);
  }
}

/** Захват указателя, чтобы свайп продолжал отслеживаться за пределами карточки. */
function capturePointer(target: HTMLElement, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Некоторые WebView не поддерживают захват для данного указателя — свайп всё равно работает.
  }
}
