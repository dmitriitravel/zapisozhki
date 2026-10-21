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
import { TelegramService } from '@memo/shared/telegram';
import { Card } from '../../../core/models/interfaces';
import { ProfileService } from '../../../core/profile/profile.service';
import { SpeechService } from '../../../core/speech/speech.service';
import { MemoStore } from '../../../core/store/memo-store.service';
import { StudyMode } from '../../../core/study/interfaces';
import { StudySession } from '../../../core/study/study-session.service';
import { ToastService } from '../../../core/toast/toast.service';
import { ActionSheetComponent } from '../../../ui/action-sheet/action-sheet.component';
import { AvatarComponent } from '../../../ui/avatar/avatar.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { ActionSheetOption } from '../../../ui/interfaces';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import { DrillingListSheetComponent } from '../drilling-list-sheet/drilling-list-sheet.component';
import { AddMenuAction, CardQueueMenuAction } from '../interfaces';
import { MemoViewComponent } from '../memo-view/memo-view.component';
import { StudySessionComponent } from '../study-session/study-session.component';

const ALL_DECKS = '__all__';
const TICK_MS = 1000;

/**
 * Экран «Тренировка»: шапка с аватаром, выбором области и «+», переключатель Memo/Dremo,
 * стопка карточек (Dremo) или просмотр (Memo), шторка Drilling list.
 */
@Component({
  selector: 'memo-training',
  standalone: true,
  imports: [
    PageHeaderComponent,
    IconComponent,
    AvatarComponent,
    ActionSheetComponent,
    StudySessionComponent,
    MemoViewComponent,
    DrillingListSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './training.component.html',
  styleUrl: './training.component.scss',
})
export class TrainingComponent {
  /** Query-параметры: область (колода) и режим. */
  readonly deckId = input<string>();
  readonly mode = input<string>();

  readonly session = inject(StudySession);

  private readonly store = inject(MemoStore);
  private readonly profile = inject(ProfileService);
  private readonly speech = inject(SpeechService);
  private readonly router = inject(Router);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly scopePickerOpenState = signal(false);
  private readonly addMenuOpenState = signal(false);
  private readonly listOpenState = signal(false);
  private readonly cardMenuState = signal<Card | null>(null);

  readonly isScopePickerOpen = this.scopePickerOpenState.asReadonly();
  readonly isAddMenuOpen = this.addMenuOpenState.asReadonly();
  readonly isListOpen = this.listOpenState.asReadonly();
  readonly cardMenuTarget = this.cardMenuState.asReadonly();

  readonly initials = this.profile.initials;
  readonly photoUrl = this.profile.photoUrl;
  readonly hasDecks = computed(() => this.store.decks().length > 0);
  readonly listCount = computed(() => this.session.queueCards().length);

  /** Подпись «N из M» рядом с переключателем режимов (в Memo счётчик показан под карточкой). */
  readonly positionLabel = computed(() => {
    if (this.session.mode() === 'memo') {
      return '';
    }
    const progress = this.session.progress();
    return progress.total === 0 || this.session.current() === null
      ? ''
      : `${progress.position} из ${progress.total}`;
  });

  readonly scopeOptions = computed<readonly ActionSheetOption[]>(() => [
    {
      id: ALL_DECKS,
      label: 'Drilling list — все активные колоды',
      icon: 'layers',
      selected: this.session.deckId() === null,
    },
    ...this.store.decks().map((deck) => ({
      id: deck.id,
      label: `${deck.emoji} ${deck.title}`,
      selected: this.session.deckId() === deck.id,
    })),
  ]);

  readonly addMenuOptions = computed<readonly ActionSheetOption<AddMenuAction>[]>(() => [
    ...(this.hasDecks()
      ? [{ id: 'new-card' as const, label: 'Новая карточка', icon: 'plus' as const }]
      : []),
    { id: 'new-deck', label: 'Новая колода', icon: 'folder' },
    { id: 'library', label: 'Из библиотеки…', icon: 'landmark' },
  ]);

  readonly cardMenuOptions: readonly ActionSheetOption<CardQueueMenuAction>[] = [
    { id: 'speak-question', label: 'Озвучить вопрос', icon: 'volume' },
    { id: 'speak-answer', label: 'Озвучить ответ', icon: 'volume' },
    { id: 'edit', label: 'Редактировать', icon: 'pencil' },
    { id: 'open-deck', label: 'Открыть колоду', icon: 'folder' },
    { id: 'reset', label: 'Сбросить прогресс', icon: 'rotate-ccw' },
    { id: 'delete', label: 'Удалить карточку', icon: 'trash', destructive: true },
  ];

  constructor() {
    effect(() => {
      const deckId = this.deckId() ?? null;
      untracked(() => this.session.setScope(deckId));
    });
    effect(() => {
      const mode = this.mode();
      untracked(() => {
        if (mode === 'memo' || mode === 'dremo') {
          this.session.setMode(mode);
        }
      });
    });

    const timer = setInterval(() => this.session.tickNow(), TICK_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(timer);
      this.speech.stop();
    });
  }

  setMode(mode: StudyMode): void {
    if (this.session.mode() === mode) {
      return;
    }
    this.telegram.hapticSelection();
    this.session.setMode(mode);
    void this.router.navigate([], {
      queryParams: { mode: mode === 'dremo' ? null : mode },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openScopePicker(): void {
    if (!this.hasDecks()) {
      return;
    }
    this.telegram.hapticImpact('light');
    this.scopePickerOpenState.set(true);
  }

  closeScopePicker(): void {
    this.scopePickerOpenState.set(false);
  }

  selectScope(id: string): void {
    this.closeScopePicker();
    this.telegram.hapticSelection();
    const deckId = id === ALL_DECKS ? null : id;
    this.session.setScope(deckId);
    void this.router.navigate([], {
      queryParams: { deckId },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  openAddMenu(): void {
    this.telegram.hapticImpact('light');
    this.addMenuOpenState.set(true);
  }

  closeAddMenu(): void {
    this.addMenuOpenState.set(false);
  }

  onAddAction(action: string): void {
    this.closeAddMenu();
    switch (action as AddMenuAction) {
      case 'new-card':
        this.addCard();
        return;
      case 'new-deck':
        void this.router.navigate(['/decks/new']);
        return;
      case 'library':
        void this.router.navigate(['/library']);
        return;
    }
  }

  /** «Новая карточка»: в выбранную колоду, иначе в самую свежую. */
  addCard(): void {
    const deckId = this.session.deckId() ?? this.store.decks()[0]?.id ?? null;
    if (!deckId) {
      void this.router.navigate(['/decks/new']);
      return;
    }
    void this.router.navigate(['/decks', deckId, 'cards', 'new']);
  }

  goToMore(): void {
    void this.router.navigate(['/more']);
  }

  openList(): void {
    this.telegram.hapticImpact('light');
    this.listOpenState.set(true);
  }

  closeList(): void {
    this.listOpenState.set(false);
  }

  openCard(card: Card): void {
    void this.router.navigate(['/decks', card.deckId, 'cards', card.id]);
  }

  openCardMenu(card: Card): void {
    this.telegram.hapticImpact('light');
    this.cardMenuState.set(card);
  }

  closeCardMenu(): void {
    this.cardMenuState.set(null);
  }

  speak(card: Card): void {
    this.speech.toggle(card.question);
  }

  async onCardAction(action: string): Promise<void> {
    const card = this.cardMenuState();
    this.closeCardMenu();
    if (!card) {
      return;
    }
    switch (action as CardQueueMenuAction) {
      case 'speak-question':
        this.speech.speak(card.question);
        return;
      case 'speak-answer':
        this.speech.speak(card.answer || card.question);
        return;
      case 'edit':
        this.openCard(card);
        return;
      case 'open-deck':
        await this.router.navigate(['/decks', card.deckId]);
        return;
      case 'reset':
        await this.store.resetCardProgress(card.id);
        this.toast.show('Прогресс карточки сброшен');
        return;
      case 'delete': {
        const confirmed = await this.telegram.showConfirm('Удалить карточку?');
        if (!confirmed) {
          return;
        }
        await this.store.deleteCard(card.id);
        this.session.removeFromQueue(card.id);
        this.telegram.hapticNotification('success');
        this.toast.show('Карточка удалена');
        return;
      }
    }
  }
}
