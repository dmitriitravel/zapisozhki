import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { ReviewGrade } from '@memo/shared/spaced-repetition';
import { TelegramService } from '@memo/shared/telegram';
import { Card } from '../../../core/models/interfaces';
import { MemoStore } from '../../../core/store/memo-store.service';
import { StudyService } from '../../../core/study/study.service';
import { formatCountdown } from '../../../core/utils/format';
import { CardImageComponent } from '../../../ui/card-image/card-image.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import {
  EMPTY_SESSION_RESULT,
  IDLE_SWIPE,
  SessionProgress,
  SessionResult,
  SwipeDirection,
  SwipeState,
} from '../interfaces';

const SWIPE_THRESHOLD_PX = 90;
const SWIPE_MAX_ROTATION_DEG = 12;
const TICK_MS = 1000;

@Component({
  selector: 'memo-study-session',
  standalone: true,
  imports: [PageHeaderComponent, IconComponent, CardImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './study-session.component.html',
  styleUrl: './study-session.component.scss',
})
export class StudySessionComponent {
  /** Query-параметр: если задан — учим только одну колоду. */
  readonly deckId = input<string>();

  private readonly store = inject(MemoStore);
  private readonly study = inject(StudyService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly telegram = inject(TelegramService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly queueState = signal<readonly string[]>([]);
  private readonly flippedState = signal(false);
  private readonly learnAheadState = signal(false);
  private readonly resultState = signal<SessionResult>(EMPTY_SESSION_RESULT);
  private readonly swipeState = signal<SwipeState>(IDLE_SWIPE);
  private readonly tickState = signal(Date.now());
  private readonly ratingState = signal(false);
  private readonly startedState = signal(false);
  private suppressNextClick = false;

  readonly isFlipped = this.flippedState.asReadonly();
  readonly result = this.resultState.asReadonly();
  readonly swipe = this.swipeState.asReadonly();
  readonly isStarted = this.startedState.asReadonly();

  readonly deck = computed(() => {
    const id = this.deckId();
    return id ? this.store.getDeckById(id) : null;
  });

  /** Карточки очереди в актуальном состоянии (из стора). */
  private readonly queueCards = computed(() =>
    this.queueState()
      .map((id) => this.store.getCardById(id))
      .filter((card): card is Card => card !== null)
  );

  /** Текущая карточка: первая, чьё время пришло, либо первая вообще в режиме «показать сейчас». */
  readonly current = computed<Card | null>(() => {
    const cards = this.queueCards();
    if (cards.length === 0) {
      return null;
    }
    if (this.learnAheadState()) {
      return cards[0];
    }
    const now = this.tickState();
    return cards.find((card) => card.scheduling.dueAt <= now) ?? null;
  });

  /** Ближайшая карточка, если сейчас показывать нечего (все на коротких шагах). */
  readonly waitingFor = computed(() => {
    if (this.current() !== null) {
      return null;
    }
    const cards = this.queueCards();
    if (cards.length === 0) {
      return null;
    }
    const nearest = cards.reduce((min, card) =>
      card.scheduling.dueAt < min.scheduling.dueAt ? card : min
    );
    return {
      card: nearest,
      countdown: formatCountdown(nearest.scheduling.dueAt - this.tickState()),
    };
  });

  readonly isFinished = computed(
    () => this.startedState() && this.queueCards().length === 0
  );

  readonly progress = computed<SessionProgress>(() => {
    const done = this.resultState().reviewed;
    const remaining = this.queueCards().length;
    const total = done + remaining;
    return {
      done,
      remaining,
      total,
      percent: total === 0 ? 100 : Math.round((done / total) * 100),
    };
  });

  readonly gradeOptions = computed(() => {
    const card = this.current();
    return card ? this.study.getGradeOptions(card, this.tickState()) : [];
  });

  readonly swipeDirection = computed<SwipeDirection>(() => {
    const delta = this.swipeState().deltaX;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) {
      return null;
    }
    return delta < 0 ? 'left' : 'right';
  });

  readonly cardTransform = computed(() => {
    const { deltaX, active } = this.swipeState();
    if (!active && deltaX === 0) {
      return '';
    }
    const rotation = Math.max(
      -SWIPE_MAX_ROTATION_DEG,
      Math.min(SWIPE_MAX_ROTATION_DEG, deltaX / 12)
    );
    return `translateX(${deltaX}px) rotate(${rotation}deg)`;
  });

  readonly swipeEnabled = computed(() => this.store.settings().swipeToRate);

  constructor() {
    effect(() => {
      const deckId = this.deckId() ?? null;
      untracked(() => this.start(deckId));
    });

    const timer = setInterval(() => this.tickState.set(Date.now()), TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  flip(): void {
    if (this.suppressNextClick) {
      // Клик, который браузер генерирует после свайпа, не должен переворачивать следующую карточку.
      this.suppressNextClick = false;
      return;
    }
    if (this.flippedState()) {
      return;
    }
    this.telegram.hapticImpact('light');
    this.flippedState.set(true);
  }

  async rate(grade: ReviewGrade): Promise<void> {
    const card = this.current();
    if (!card || this.ratingState()) {
      return;
    }
    this.ratingState.set(true);
    try {
      const updated = await this.study.rate(card, grade, Date.now());
      const stillLearning =
        updated.scheduling.state === 'learning' ||
        updated.scheduling.state === 'relearning';

      this.queueState.update((queue) => {
        const rest = queue.filter((id) => id !== card.id);
        return stillLearning ? [...rest, card.id] : rest;
      });
      this.resultState.update((result) => ({
        ...result,
        reviewed: result.reviewed + 1,
        [grade]: result[grade] + 1,
      }));
      this.flippedState.set(false);
      this.learnAheadState.set(false);
      this.swipeState.set(IDLE_SWIPE);
      this.tickState.set(Date.now());
      this.telegram.hapticNotification(grade === 'again' ? 'warning' : 'success');
    } finally {
      this.ratingState.set(false);
    }
  }

  showNow(): void {
    this.learnAheadState.set(true);
  }

  restart(): void {
    this.start(this.deckId() ?? null);
  }

  exit(): void {
    this.location.back();
  }

  goToDecks(): void {
    void this.router.navigate(['/decks'], { replaceUrl: true });
  }

  onPointerDown(event: PointerEvent): void {
    // Новое касание — предыдущий «подавленный» клик уже не актуален.
    this.suppressNextClick = false;
    if (!this.swipeEnabled() || !this.flippedState()) {
      return;
    }
    capturePointer(event);
    this.swipeState.set({
      startX: event.clientX,
      startY: event.clientY,
      deltaX: 0,
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
    this.swipeState.set({ ...swipe, deltaX });
  }

  onPointerUp(): void {
    const swipe = this.swipeState();
    if (!swipe.active) {
      return;
    }
    const direction = this.swipeDirection();
    this.swipeState.set(IDLE_SWIPE);
    this.suppressNextClick = direction !== null;
    if (direction === 'left') {
      void this.rate('again');
    } else if (direction === 'right') {
      void this.rate('good');
    }
  }

  private start(deckId: string | null): void {
    const queue = this.study.buildQueue(deckId, Date.now());
    this.queueState.set(queue.map((card) => card.id));
    this.resultState.set(EMPTY_SESSION_RESULT);
    this.flippedState.set(false);
    this.learnAheadState.set(false);
    this.swipeState.set(IDLE_SWIPE);
    this.tickState.set(Date.now());
    this.startedState.set(true);
  }
}

/** Захват указателя, чтобы свайп продолжал отслеживаться за пределами карточки. */
function capturePointer(event: PointerEvent): void {
  const target = event.currentTarget;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  try {
    target.setPointerCapture(event.pointerId);
  } catch {
    // Некоторые WebView не поддерживают захват для данного указателя — свайп всё равно работает.
  }
}
