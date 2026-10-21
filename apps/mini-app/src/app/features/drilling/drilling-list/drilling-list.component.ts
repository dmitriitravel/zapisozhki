import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { Card } from '../../../core/models/interfaces';
import { MemoStore } from '../../../core/store/memo-store.service';
import { StudyService } from '../../../core/study/study.service';
import { ToastService } from '../../../core/toast/toast.service';
import { ActionSheetComponent } from '../../../ui/action-sheet/action-sheet.component';
import { CardListItemComponent } from '../../../ui/card-list-item/card-list-item.component';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { ActionSheetOption } from '../../../ui/interfaces';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import { CardQueueMenuAction } from '../interfaces';

const ALL_DECKS = '__all__';

@Component({
  selector: 'memo-drilling-list',
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
  templateUrl: './drilling-list.component.html',
  styleUrl: './drilling-list.component.scss',
})
export class DrillingListComponent {
  private readonly store = inject(MemoStore);
  private readonly study = inject(StudyService);
  private readonly router = inject(Router);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  private readonly selectedDeckIdState = signal<string | null>(null);
  private readonly deckPickerOpenState = signal(false);
  private readonly addPickerOpenState = signal(false);
  private readonly cardMenuState = signal<Card | null>(null);

  readonly isDeckPickerOpen = this.deckPickerOpenState.asReadonly();
  readonly isAddPickerOpen = this.addPickerOpenState.asReadonly();
  readonly cardMenuTarget = this.cardMenuState.asReadonly();

  readonly decks = this.store.decks;
  readonly selectedDeck = computed(() => {
    const id = this.selectedDeckIdState();
    return id ? this.store.getDeckById(id) : null;
  });
  readonly title = computed(() => this.selectedDeck()?.title ?? 'Список повторения');

  readonly queue = computed(() =>
    this.study.buildQueue(this.selectedDeckIdState(), this.store.now())
  );
  readonly summary = computed(() => this.study.summarize(this.queue()));
  readonly hasDecks = computed(() => this.store.decks().length > 0);
  readonly hasCards = computed(() => this.store.cards().length > 0);

  readonly deckPickerOptions = computed<readonly ActionSheetOption[]>(() => [
    {
      id: ALL_DECKS,
      label: 'Все активные колоды',
      icon: 'layers',
      selected: this.selectedDeckIdState() === null,
    },
    ...this.store.decks().map((deck) => ({
      id: deck.id,
      label: `${deck.emoji} ${deck.title}`,
      selected: this.selectedDeckIdState() === deck.id,
    })),
  ]);

  readonly addPickerOptions = computed<readonly ActionSheetOption[]>(() =>
    this.store.decks().map((deck) => ({
      id: deck.id,
      label: `${deck.emoji} ${deck.title}`,
    }))
  );

  readonly cardMenuOptions: readonly ActionSheetOption<CardQueueMenuAction>[] = [
    { id: 'edit', label: 'Редактировать', icon: 'pencil' },
    { id: 'reset', label: 'Сбросить прогресс', icon: 'rotate-ccw' },
    { id: 'delete', label: 'Удалить карточку', icon: 'trash', destructive: true },
  ];

  openDeckPicker(): void {
    if (!this.hasDecks()) {
      return;
    }
    this.telegram.hapticImpact('light');
    this.deckPickerOpenState.set(true);
  }

  closeDeckPicker(): void {
    this.deckPickerOpenState.set(false);
  }

  selectDeck(id: string): void {
    this.closeDeckPicker();
    this.telegram.hapticSelection();
    this.selectedDeckIdState.set(id === ALL_DECKS ? null : id);
  }

  /** «+»: если выбрана конкретная колода — сразу в неё, иначе спросить. */
  addCard(): void {
    const selected = this.selectedDeckIdState();
    if (selected) {
      void this.router.navigate(['/decks', selected, 'cards', 'new']);
      return;
    }
    if (!this.hasDecks()) {
      void this.router.navigate(['/decks/new']);
      return;
    }
    this.addPickerOpenState.set(true);
  }

  closeAddPicker(): void {
    this.addPickerOpenState.set(false);
  }

  onAddPickerSelected(deckId: string): void {
    this.closeAddPicker();
    void this.router.navigate(['/decks', deckId, 'cards', 'new']);
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

  async onCardAction(action: string): Promise<void> {
    const card = this.cardMenuState();
    this.closeCardMenu();
    if (!card) {
      return;
    }
    switch (action as CardQueueMenuAction) {
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
        this.toast.show('Карточка удалена');
        return;
      }
    }
  }

  startSession(): void {
    this.telegram.hapticImpact('medium');
    const deckId = this.selectedDeckIdState();
    void this.router.navigate(['/drilling/session'], {
      queryParams: deckId ? { deckId } : {},
    });
  }
}
