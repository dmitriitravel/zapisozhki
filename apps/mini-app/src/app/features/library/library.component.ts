import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { LibraryService } from '../../core/library/library.service';
import { LibraryIndexEntry } from '../../core/models/interfaces';
import { ToastService } from '../../core/toast/toast.service';
import { formatCount } from '../../core/utils/format';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { PageHeaderComponent } from '../../ui/page-header/page-header.component';
import { LibraryListItem } from './interfaces';

@Component({
  selector: 'memo-library',
  standalone: true,
  imports: [PageHeaderComponent, IconComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './library.component.html',
  styleUrl: './library.component.scss',
})
export class LibraryComponent implements OnInit {
  private readonly library = inject(LibraryService);
  private readonly router = inject(Router);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);

  private readonly installingState = signal<string | null>(null);
  private readonly errorState = signal(false);

  readonly isLoading = this.library.isLoading;
  readonly hasError = this.errorState.asReadonly();
  readonly installingId = this.installingState.asReadonly();

  readonly items = computed<readonly LibraryListItem[]>(() =>
    this.library.entries().map((entry) => ({
      entry,
      installedDeckId: this.library.getInstalledDeckId(entry.id),
    }))
  );

  ngOnInit(): void {
    void this.load();
  }

  /** «Добавить» / «Ещё раз»: копия колоды появляется в «Колодах». */
  async install(entry: LibraryIndexEntry): Promise<void> {
    if (this.installingState()) {
      return;
    }
    this.installingState.set(entry.id);
    try {
      const deck = await this.library.install(entry);
      this.telegram.hapticNotification('success');
      this.toast.success(`Колода «${deck.title}» добавлена`);
      await this.router.navigate(['/decks', deck.id]);
    } catch {
      this.toast.error('Не удалось добавить колоду');
    } finally {
      this.installingState.set(null);
    }
  }

  openDeck(deckId: string): void {
    this.telegram.hapticSelection();
    void this.router.navigate(['/decks', deckId]);
  }

  formatCards(count: number): string {
    return formatCount(count, ['карточка', 'карточки', 'карточек']);
  }

  retry(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    this.errorState.set(false);
    try {
      await this.library.loadIndex();
    } catch {
      this.errorState.set(true);
    }
  }
}
