import { Injectable, computed, inject } from '@angular/core';
import { TelegramService } from '@memo/shared/telegram';
import { MemoStore } from '../store/memo-store.service';
import { formatInitials } from '../utils/format';

/** Имя и инициалы пользователя: из настроек, иначе из профиля Telegram. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly store = inject(MemoStore);
  private readonly telegram = inject(TelegramService);

  readonly displayName = computed(() => {
    const custom = this.store.settings().userName.trim();
    if (custom) {
      return custom;
    }
    const user = this.telegram.getUser();
    return user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : '';
  });

  readonly initials = computed(() => formatInitials(this.displayName()));

  readonly photoUrl = computed(() => this.telegram.getUser()?.photo_url ?? null);
}
