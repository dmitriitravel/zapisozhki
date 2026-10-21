import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { MemoStore } from '../../../core/store/memo-store.service';
import { ToastService } from '../../../core/toast/toast.service';
import { IconComponent } from '../../../ui/icon/icon.component';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import { DECK_EMOJIS, DeckEditorForm } from '../interfaces';

const EMPTY_FORM: DeckEditorForm = {
  title: '',
  description: '',
  emoji: DECK_EMOJIS[0],
};

@Component({
  selector: 'memo-deck-editor',
  standalone: true,
  imports: [PageHeaderComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deck-editor.component.html',
  styleUrl: './deck-editor.component.scss',
})
export class DeckEditorComponent {
  /** Привязывается из маршрута decks/:deckId/edit; для создания — undefined. */
  readonly deckId = input<string>();

  private readonly store = inject(MemoStore);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  private readonly formState = signal<DeckEditorForm>(EMPTY_FORM);
  private readonly savingState = signal(false);

  readonly emojis = DECK_EMOJIS;
  readonly form = this.formState.asReadonly();
  readonly isSaving = this.savingState.asReadonly();
  readonly isEdit = computed(() => Boolean(this.deckId()));
  readonly canSave = computed(
    () => this.formState().title.trim().length > 0 && !this.savingState()
  );

  constructor() {
    effect(() => {
      const id = this.deckId();
      untracked(() => this.prefill(id));
    });
  }

  setTitle(value: string): void {
    this.formState.update((form) => ({ ...form, title: value }));
  }

  setDescription(value: string): void {
    this.formState.update((form) => ({ ...form, description: value }));
  }

  setEmoji(emoji: string): void {
    this.telegram.hapticSelection();
    this.formState.update((form) => ({ ...form, emoji }));
  }

  cancel(): void {
    this.location.back();
  }

  async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.savingState.set(true);
    try {
      const id = this.deckId();
      if (id) {
        await this.store.updateDeck(id, this.formState());
        this.toast.success('Колода обновлена');
        this.location.back();
      } else {
        const deck = await this.store.createDeck(this.formState());
        this.toast.success('Колода создана');
        await this.router.navigate(['/decks', deck.id], { replaceUrl: true });
      }
      this.telegram.hapticNotification('success');
    } finally {
      this.savingState.set(false);
    }
  }

  private prefill(deckId: string | undefined): void {
    if (!deckId) {
      this.formState.set(EMPTY_FORM);
      return;
    }
    const deck = this.store.getDeckById(deckId);
    if (deck) {
      this.formState.set({
        title: deck.title,
        description: deck.description,
        emoji: deck.emoji,
      });
    }
  }
}
