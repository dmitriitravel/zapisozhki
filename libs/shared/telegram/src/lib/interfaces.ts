/**
 * Минимально необходимая типизация Telegram WebApp SDK
 * (https://core.telegram.org/bots/webapps). Описаны только используемые поля.
 */

export type TelegramColorScheme = 'light' | 'dark';

export type TelegramHapticImpactStyle =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'rigid'
  | 'soft';

export type TelegramHapticNotificationType = 'error' | 'success' | 'warning';

export interface TelegramThemeParams {
  readonly bg_color?: string;
  readonly text_color?: string;
  readonly hint_color?: string;
  readonly link_color?: string;
  readonly button_color?: string;
  readonly button_text_color?: string;
  readonly secondary_bg_color?: string;
  readonly header_bg_color?: string;
  readonly accent_text_color?: string;
  readonly section_bg_color?: string;
  readonly section_header_text_color?: string;
  readonly subtitle_text_color?: string;
  readonly destructive_text_color?: string;
}

export interface TelegramWebAppUser {
  readonly id: number;
  readonly first_name: string;
  readonly last_name?: string;
  readonly username?: string;
  readonly language_code?: string;
  readonly photo_url?: string;
}

export interface TelegramInitDataUnsafe {
  readonly user?: TelegramWebAppUser;
  readonly start_param?: string;
}

export interface TelegramBackButton {
  readonly isVisible: boolean;
  show(): void;
  hide(): void;
  onClick(callback: () => void): void;
  offClick(callback: () => void): void;
}

export interface TelegramHapticFeedback {
  impactOccurred(style: TelegramHapticImpactStyle): void;
  notificationOccurred(type: TelegramHapticNotificationType): void;
  selectionChanged(): void;
}

export type TelegramCloudCallback<T> = (
  error: string | null,
  result?: T
) => void;

export interface TelegramCloudStorage {
  setItem(
    key: string,
    value: string,
    callback?: TelegramCloudCallback<boolean>
  ): void;
  getItem(key: string, callback: TelegramCloudCallback<string>): void;
  getItems(
    keys: readonly string[],
    callback: TelegramCloudCallback<Record<string, string>>
  ): void;
  removeItem(key: string, callback?: TelegramCloudCallback<boolean>): void;
  removeItems(
    keys: readonly string[],
    callback?: TelegramCloudCallback<boolean>
  ): void;
  getKeys(callback: TelegramCloudCallback<string[]>): void;
}

export type TelegramEventType =
  | 'themeChanged'
  | 'viewportChanged'
  | 'backButtonClicked'
  | 'settingsButtonClicked';

export interface TelegramWebApp {
  readonly initData: string;
  readonly initDataUnsafe: TelegramInitDataUnsafe;
  readonly version: string;
  readonly platform: string;
  readonly colorScheme: TelegramColorScheme;
  readonly themeParams: TelegramThemeParams;
  readonly isExpanded: boolean;
  readonly viewportHeight: number;
  readonly viewportStableHeight: number;
  readonly BackButton: TelegramBackButton;
  readonly HapticFeedback: TelegramHapticFeedback;
  readonly CloudStorage: TelegramCloudStorage;
  ready(): void;
  expand(): void;
  close(): void;
  isVersionAtLeast(version: string): boolean;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  disableVerticalSwipes?(): void;
  enableVerticalSwipes?(): void;
  showAlert(message: string, callback?: () => void): void;
  showConfirm(message: string, callback?: (confirmed: boolean) => void): void;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  onEvent(eventType: TelegramEventType, handler: () => void): void;
  offEvent(eventType: TelegramEventType, handler: () => void): void;
}

export interface TelegramNamespace {
  readonly WebApp?: TelegramWebApp;
}

declare global {
  interface Window {
    Telegram?: TelegramNamespace;
  }
}
