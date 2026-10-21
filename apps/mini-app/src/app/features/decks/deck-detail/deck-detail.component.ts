import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { Card } from '../../../core/models/interfaces';
import { SpeechService } from '../../../core/speech/speech.service';
import { MemoStore } from '../../../core/store/memo-store.service';
import { CardStateLabel, StudyMode } from '../../../core/study/interfaces';
import { StudyService } from '../../../core/study/study.service';
import { ToastService } from '../../../core/toast/toast.service';
import { formatCount } from '../../../core/utils/format';
import { ActionSheetComponent } from '../../../ui/action-sheet/action-sheet.component';
import { CardListItemComponent } from '../../../ui/card-list-item/card-list-item.component';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { ActionSheetOption } from '../../../ui/interfaces';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import { CardMenuAction, DeckMenuAction } from '../interfaces';

@Component({
  selector: 'memo-deck-detail',
  standalone: true,
  imports: [
    RouterLink,
    PageHeaderComponent,
    IconComponent,
    CardListItemComponent,
    EmptyStateComponent,
    ActionSheetComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deck-detail.component.html',
  styleUrl: './deck-detail.component.scss',
})
export class DeckDetailComponent {
  readonly deckId = input.required<string>();

  private readonly store = inject(MemoStore);
  private readonly study = inject(StudyService);
  private readonly speech = inject(SpeechService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  private readonly queryState = signal('');
  private readonly deckMenuOpenState = signal(false);
  private readonly cardMenuState = signal<Card | null>(null);

  readonly query = this.queryState.asReadonly();
  readonly isDeckMenuOpen = this.deckMenuOpenState.asReadonly();
  readonly cardMenuTarget = this.cardMenuState.asReadonly();
  readonly canSpeak = this.speech.isAvailable();
  readonly speakingText = this.speech.speakingText;

  readonly deck = computed(() => this.store.getDeckById(this.deckId()));
  readonly stats = computed(() => this.store.getDeckStats(this.deckId()));
  readonly cards = computed(() => {
    const all = this.store.cardsByDeck().get(this.deckId()) ?? [];
    const query = this.queryState().trim().toLowerCase();
    const filtered = query
      ? all.filter(
          (card) =>
            card.question.toLowerCase().includes(query) ||
            card.answer.toLowerCase().includes(query)
        )
      : all;
    return [...filtered].sort((a, b) => b.createdAt - a.createdAt);
  });
  readonly todayCount = computed(
    () => this.study.buildQueue(this.deckId(), this.store.now()).length
  );

  readonly deckMenuOptions = computed<readonly ActionSheetOption<DeckMenuAction>[]>(
    () => [
      { id: 'edit', label: 'Изменить', icon: 'pencil' },
      {
        id: 'toggle-active',
        label: this.deck()?.isActive
          ? 'Убрать из Drilling list'
          : 'Добавить в Drilling list',
        icon: this.deck()?.isActive ? 'eye-off' : 'eye',
      },
      { id: 'reset-all', label: 'Сбросить прогресс всех карточек', icon: 'rotate-ccw' },
      { id: 'delete', label: 'Удалить колоду', icon: 'trash', destructive: true },
    ]
  );

  readonly cardMenuOptions = computed<readonly ActionSheetOption<CardMenuAction>[]>(() => [
    ...(this.canSpeak
      ? [{ id: 'speak' as const, label: 'Озвучить вопрос', icon: 'volume' as const }]
      : []),
    { id: 'edit', label: 'Редактировать', icon: 'pencil' },
    { id: 'reset', label: 'Сбросить прогресс', icon: 'rotate-ccw' },
    { id: 'delete', label: 'Удалить карточку', icon: 'trash', destructive: true },
  ]);

  setQuery(value: string): void {
    this.queryState.set(value);
  }

  back(): void {
    this.location.back();
  }

  openDeckMenu(): void {
    this.telegram.hapticImpact('light');
    this.deckMenuOpenState.set(true);
  }

  closeDeckMenu(): void {
    this.deckMenuOpenState.set(false);
  }

  openCardMenu(card: Card): void {
    this.telegram.hapticImpact('light');
    this.cardMenuState.set(card);
  }

  closeCardMenu(): void {
    this.cardMenuState.set(null);
  }

  openCard(card: Card): void {
    void this.router.navigate(['/decks', this.deckId(), 'cards', card.id]);
  }

  describe(card: Card): CardStateLabel {
    return this.study.describeState(card, this.store.now());
  }

  isSpeaking(card: Card): boolean {
    return this.speakingText() === card.question.trim();
  }

  speak(card: Card): void {
    this.speech.toggle(card.question);
  }

  /** «Тренировать» (Dremo) или «Memo» — на экран тренировки с этой колодой. */
  train(mode: StudyMode): void {
    this.telegram.hapticImpact('medium');
    void this.router.navigate(['/drilling'], {
      queryParams: { deckId: this.deckId(), mode: mode === 'dremo' ? null : mode },
    });
  }

  async onDeckAction(action: string): Promise<void> {
    this.closeDeckMenu();
    const deck = this.deck();
    if (!deck) {
      return;
    }
    switch (action as DeckMenuAction) {
      case 'study':
        this.train('dremo');
        return;
      case 'memo':
        this.train('memo');
        return;
      case 'edit':
        await this.router.navigate(['/decks', deck.id, 'edit']);
        return;
      case 'toggle-active':
        await this.store.setDeckActive(deck.id, !deck.isActive);
        this.toast.show(
          deck.isActive ? 'Колода убрана из Drilling list' : 'Колода добавлена в Drilling list'
        );
        return;
      case 'reset-all': {
        const confirmed = await this.telegram.showConfirm(
          `Сбросить прогресс всех карточек колоды «${deck.title}»? Они снова станут новыми.`
        );
        if (!confirmed) {
          return;
        }
        await this.store.resetDeckProgress(deck.id);
        this.telegram.hapticNotification('success');
        this.toast.show('Прогресс колоды сброшен');
        return;
      }
      case 'delete': {
        const confirmed = await this.telegram.showConfirm(
          `Удалить колоду «${deck.title}» и все её карточки?`
        );
        if (!confirmed) {
          return;
        }
        await this.store.deleteDeck(deck.id);
        this.telegram.hapticNotification('success');
        this.toast.show('Колода удалена');
        await this.router.navigate(['/decks'], { replaceUrl: true });
        return;
      }
    }
  }

  async onCardAction(action: string): Promise<void> {
    const card = this.cardMenuState();
    this.closeCardMenu();
    if (!card) {
      return;
    }
    switch (action as CardMenuAction) {
      case 'speak':
        this.speech.speak(card.question);
        return;
      case 'edit':
        this.openCard(card);
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
        this.telegram.hapticNotification('success');
        this.toast.show('Карточка удалена');
        return;
      }
    }
  }

  formatCards(count: number): string {
    return formatCount(count, ['карточка', 'карточки', 'карточек']);
  }
}
