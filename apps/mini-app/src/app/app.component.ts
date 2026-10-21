import { Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { filter } from 'rxjs';
import { SyncService } from './core/cloud/sync.service';
import { MemoStore } from './core/store/memo-store.service';
import { TabBarComponent } from './ui/tab-bar/tab-bar.component';
import { ToastComponent } from './ui/toast/toast.component';

const ROOT_TABS: readonly string[] = ['/drilling', '/decks', '/library', '/more'];

@Component({
  selector: 'memo-root',
  standalone: true,
  imports: [RouterOutlet, TabBarComponent, ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.isLoaded()) {
      <router-outlet />
      @if (showTabBar()) {
        <memo-tab-bar />
      }
    } @else {
      <div class="memo-loading"><div class="memo-spinner"></div></div>
    }
    <memo-toast />
  `,
})
export class AppComponent {
  readonly store = inject(MemoStore);

  private readonly telegram = inject(TelegramService);
  private readonly sync = inject(SyncService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  private readonly showTabBarState = signal(true);

  readonly showTabBar = this.showTabBarState.asReadonly();

  constructor() {
    this.telegram.init();
    // Сначала показываем локальные данные, затем в фоне сверяемся с облаком.
    void this.store.load().then(() => this.sync.start());

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => this.onNavigated(event.urlAfterRedirects));
  }

  private onNavigated(url: string): void {
    const path = url.split('?')[0];
    const isRoot = ROOT_TABS.includes(path);
    this.showTabBarState.set(isRoot);

    if (isRoot) {
      this.telegram.hideBackButton();
    } else {
      this.telegram.showBackButton(() => this.location.back());
    }
  }
}
