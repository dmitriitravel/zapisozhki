import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { IconComponent } from '../icon/icon.component';
import { TabItem } from '../interfaces';

const TABS: readonly TabItem[] = [
  { path: '/drilling', label: 'Повторение', icon: 'book-open' },
  { path: '/decks', label: 'Колоды', icon: 'layers' },
  { path: '/library', label: 'Библиотека', icon: 'landmark' },
  { path: '/more', label: 'Ещё', icon: 'grid' },
];

@Component({
  selector: 'memo-tab-bar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="tab-bar">
      @for (tab of tabs; track tab.path) {
        <a
          class="tab"
          [routerLink]="tab.path"
          routerLinkActive="tab--active"
          (click)="onTap()"
        >
          <memo-icon [name]="tab.icon" [size]="24" />
          <span class="tab__label">{{ tab.label }}</span>
        </a>
      }
    </nav>
  `,
  styles: `
    :host {
      position: fixed;
      inset: auto 0 0 0;
      z-index: 20;
      background: var(--memo-section-bg);
      border-top: 1px solid var(--memo-divider);
      padding-bottom: var(--memo-safe-bottom);
    }
    .tab-bar {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      height: var(--memo-tab-bar-height);
    }
    .tab {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: var(--memo-hint);
      text-decoration: none;
      font-size: 11px;
      font-weight: 500;
      transition: color 0.15s;
    }
    .tab--active {
      color: var(--memo-accent);
    }
  `,
})
export class TabBarComponent {
  private readonly telegram = inject(TelegramService);

  readonly tabs = TABS;

  onTap(): void {
    this.telegram.hapticSelection();
  }
}
