import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { MemoStore } from '../../../core/store/memo-store.service';
import { formatCount } from '../../../core/utils/format';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import { DeckListItem } from '../interfaces';

@Component({
  selector: 'memo-decks-list',
  standalone: true,
  imports: [RouterLink, PageHeaderComponent, EmptyStateComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './decks-list.component.html',
  styleUrl: './decks-list.component.scss',
})
export class DecksListComponent {
  private readonly store = inject(MemoStore);
  private readonly router = inject(Router);
  private readonly telegram = inject(TelegramService);

  readonly items = computed<readonly DeckListItem[]>(() =>
    this.store.decks().map((deck) => ({
      deck,
      stats: this.store.getDeckStats(deck.id),
    }))
  );

  openDeck(deckId: string): void {
    this.telegram.hapticSelection();
    void this.router.navigate(['/decks', deckId]);
  }

  formatTotal(count: number): string {
    return formatCount(count, ['карточка', 'карточки', 'карточек']);
  }
}
