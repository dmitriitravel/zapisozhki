import { Injectable, signal } from '@angular/core';
import { ToastMessage } from '../../ui/interfaces';

const TOAST_DURATION_MS = 2500;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly messagesState = signal<readonly ToastMessage[]>([]);
  private counter = 0;

  readonly messages = this.messagesState.asReadonly();

  show(text: string, kind: ToastMessage['kind'] = 'info'): void {
    const id = ++this.counter;
    this.messagesState.update((messages) => [...messages, { id, text, kind }]);
    setTimeout(() => this.dismiss(id), TOAST_DURATION_MS);
  }

  success(text: string): void {
    this.show(text, 'success');
  }

  error(text: string): void {
    this.show(text, 'error');
  }

  dismiss(id: number): void {
    this.messagesState.update((messages) =>
      messages.filter((message) => message.id !== id)
    );
  }
}
