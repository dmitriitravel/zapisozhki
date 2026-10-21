import { DOCUMENT } from '@angular/common';
import { Injectable, NgZone, inject, signal } from '@angular/core';
import {
  TelegramColorScheme,
  TelegramHapticImpactStyle,
  TelegramHapticNotificationType,
  TelegramWebApp,
  TelegramWebAppUser,
} from './interfaces';

const LOCAL_CLOUD_PREFIX = 'memo-cloud:';
/**
 * Вне Telegram initData можно подложить через localStorage — для отладки
 * облачной синхронизации в обычном браузере (строка должна быть подписана токеном бота).
 */
const DEV_INIT_DATA_KEY = 'memo-dev-init-data';

/**
 * Обёртка над Telegram WebApp SDK.
 * Вне Telegram (обычный браузер) методы деградируют до нативных аналогов,
 * чтобы приложение можно было разрабатывать и тестировать локально.
 */
@Injectable({ providedIn: 'root' })
export class TelegramService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);

  /**
   * SDK подключён всегда (через index.html), но вне Telegram platform === 'unknown',
   * и его методы не дают обратной связи. В этом случае считаем, что SDK нет.
   */
  private readonly webApp: TelegramWebApp | null = this.resolveWebApp();

  private readonly colorScheme = signal<TelegramColorScheme>(
    this.detectInitialColorScheme()
  );

  private backButtonHandler: (() => void) | null = null;

  isAvailable(): boolean {
    return this.webApp !== null;
  }

  getInitData(): string {
    if (this.webApp) {
      return this.webApp.initData;
    }
    return this.document.defaultView?.localStorage.getItem(DEV_INIT_DATA_KEY) ?? '';
  }

  getColorScheme(): TelegramColorScheme {
    return this.colorScheme();
  }

  getUser(): TelegramWebAppUser | null {
    return this.webApp?.initDataUnsafe.user ?? null;
  }

  getPlatform(): string {
    return this.webApp?.platform ?? 'browser';
  }

  /** Инициализация: сообщаем Telegram о готовности и раскрываем окно. */
  init(): void {
    this.applyColorScheme(this.colorScheme());

    if (!this.webApp) {
      this.listenToSystemColorScheme();
      return;
    }

    this.webApp.ready();
    this.webApp.expand();

    if (
      this.webApp.isVersionAtLeast('7.7') &&
      typeof this.webApp.disableVerticalSwipes === 'function'
    ) {
      this.webApp.disableVerticalSwipes();
    }

    this.webApp.onEvent('themeChanged', () => {
      this.zone.run(() => {
        const scheme = this.webApp?.colorScheme ?? 'light';
        this.colorScheme.set(scheme);
        this.applyColorScheme(scheme);
      });
    });
  }

  showBackButton(handler: () => void): void {
    if (!this.webApp) {
      return;
    }
    this.hideBackButton();
    const wrapped = (): void => this.zone.run(handler);
    this.backButtonHandler = wrapped;
    this.webApp.BackButton.onClick(wrapped);
    this.webApp.BackButton.show();
  }

  hideBackButton(): void {
    if (!this.webApp) {
      return;
    }
    if (this.backButtonHandler) {
      this.webApp.BackButton.offClick(this.backButtonHandler);
      this.backButtonHandler = null;
    }
    this.webApp.BackButton.hide();
  }

  hapticImpact(style: TelegramHapticImpactStyle = 'light'): void {
    this.webApp?.HapticFeedback.impactOccurred(style);
  }

  hapticNotification(type: TelegramHapticNotificationType): void {
    this.webApp?.HapticFeedback.notificationOccurred(type);
  }

  hapticSelection(): void {
    this.webApp?.HapticFeedback.selectionChanged();
  }

  showAlert(message: string): Promise<void> {
    if (!this.webApp || !this.webApp.isVersionAtLeast('6.2')) {
      this.document.defaultView?.alert(message);
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.webApp?.showAlert(message, () => this.zone.run(resolve));
    });
  }

  showConfirm(message: string): Promise<boolean> {
    if (!this.webApp || !this.webApp.isVersionAtLeast('6.2')) {
      return Promise.resolve(
        this.document.defaultView?.confirm(message) ?? false
      );
    }
    return new Promise((resolve) => {
      this.webApp?.showConfirm(message, (confirmed) =>
        this.zone.run(() => resolve(confirmed))
      );
    });
  }

  openLink(url: string): void {
    if (this.webApp) {
      this.webApp.openLink(url);
      return;
    }
    this.document.defaultView?.open(url, '_blank', 'noopener');
  }

  isCloudStorageAvailable(): boolean {
    return this.webApp !== null && this.webApp.isVersionAtLeast('6.9');
  }

  cloudGetKeys(): Promise<readonly string[]> {
    if (!this.isCloudStorageAvailable()) {
      return Promise.resolve(this.localCloudKeys());
    }
    return new Promise((resolve, reject) => {
      this.webApp?.CloudStorage.getKeys((error, keys) =>
        this.zone.run(() =>
          error ? reject(new Error(error)) : resolve(keys ?? [])
        )
      );
    });
  }

  cloudGetItems(
    keys: readonly string[]
  ): Promise<Readonly<Record<string, string>>> {
    if (keys.length === 0) {
      return Promise.resolve({});
    }
    if (!this.isCloudStorageAvailable()) {
      const storage = this.document.defaultView?.localStorage;
      const result = keys.reduce<Record<string, string>>((acc, key) => {
        const value = storage?.getItem(LOCAL_CLOUD_PREFIX + key) ?? null;
        return value === null ? acc : { ...acc, [key]: value };
      }, {});
      return Promise.resolve(result);
    }
    return new Promise((resolve, reject) => {
      this.webApp?.CloudStorage.getItems(keys, (error, values) =>
        this.zone.run(() =>
          error ? reject(new Error(error)) : resolve(values ?? {})
        )
      );
    });
  }

  cloudSetItem(key: string, value: string): Promise<void> {
    if (!this.isCloudStorageAvailable()) {
      this.document.defaultView?.localStorage.setItem(
        LOCAL_CLOUD_PREFIX + key,
        value
      );
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.webApp?.CloudStorage.setItem(key, value, (error) =>
        this.zone.run(() => (error ? reject(new Error(error)) : resolve()))
      );
    });
  }

  cloudRemoveItems(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return Promise.resolve();
    }
    if (!this.isCloudStorageAvailable()) {
      const storage = this.document.defaultView?.localStorage;
      keys.forEach((key) => storage?.removeItem(LOCAL_CLOUD_PREFIX + key));
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      this.webApp?.CloudStorage.removeItems(keys, (error) =>
        this.zone.run(() => (error ? reject(new Error(error)) : resolve()))
      );
    });
  }

  private localCloudKeys(): readonly string[] {
    const storage = this.document.defaultView?.localStorage;
    if (!storage) {
      return [];
    }
    return Array.from({ length: storage.length }, (_, index) =>
      storage.key(index)
    )
      .filter(
        (key): key is string =>
          key !== null && key.startsWith(LOCAL_CLOUD_PREFIX)
      )
      .map((key) => key.slice(LOCAL_CLOUD_PREFIX.length));
  }

  private resolveWebApp(): TelegramWebApp | null {
    const webApp = this.document.defaultView?.Telegram?.WebApp ?? null;
    if (!webApp || webApp.platform === 'unknown') {
      return null;
    }
    return webApp;
  }

  private detectInitialColorScheme(): TelegramColorScheme {
    if (this.webApp) {
      return this.webApp.colorScheme;
    }
    const prefersDark = this.document.defaultView?.matchMedia?.(
      '(prefers-color-scheme: dark)'
    ).matches;
    return prefersDark ? 'dark' : 'light';
  }

  private listenToSystemColorScheme(): void {
    const media = this.document.defaultView?.matchMedia?.(
      '(prefers-color-scheme: dark)'
    );
    media?.addEventListener('change', (event) => {
      this.zone.run(() => {
        const scheme: TelegramColorScheme = event.matches ? 'dark' : 'light';
        this.colorScheme.set(scheme);
        this.applyColorScheme(scheme);
      });
    });
  }

  private applyColorScheme(scheme: TelegramColorScheme): void {
    this.document.documentElement.setAttribute('data-color-scheme', scheme);
  }
}
