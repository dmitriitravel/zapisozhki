import { IconName } from './icon/icons';

export interface TabItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
}

export interface ActionSheetOption<T extends string = string> {
  readonly id: T;
  readonly label: string;
  readonly icon?: IconName;
  readonly destructive?: boolean;
  readonly selected?: boolean;
}

export interface ToastMessage {
  readonly id: number;
  readonly text: string;
  readonly kind: 'info' | 'success' | 'error';
}
