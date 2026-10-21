import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Шапка экрана: слева и справа — слоты для кнопок, по центру — заголовок.
 * Использование: <memo-page-header title="Колоды"><button left>…</button><button right>…</button></memo-page-header>
 * Вместо текстового заголовка можно спроецировать свой элемент с атрибутом center.
 */
@Component({
  selector: 'memo-page-header',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="header">
      <div class="header__side header__side--left">
        <ng-content select="[left]" />
      </div>
      <div class="header__title">
        <ng-content select="[center]" />
        @if (title()) {
          <h1 class="header__text">{{ title() }}</h1>
        }
      </div>
      <div class="header__side header__side--right">
        <ng-content select="[right]" />
      </div>
    </header>
  `,
  styles: `
    :host {
      display: block;
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--memo-bg);
      padding-top: var(--memo-safe-top);
    }
    .header {
      display: grid;
      grid-template-columns: 1fr auto 1fr;
      align-items: center;
      height: 56px;
      padding: 0 12px;
    }
    .header__side {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 44px;
    }
    .header__side--right {
      justify-content: flex-end;
    }
    .header__title {
      min-width: 0;
      text-align: center;
    }
    .header__text {
      margin: 0;
      font-size: 17px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 60vw;
    }
  `,
})
export class PageHeaderComponent {
  readonly title = input<string>('');
}
