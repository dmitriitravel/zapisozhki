import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconComponent } from '../icon/icon.component';

/** Аватар: фото из Telegram, иначе инициалы на оранжевом градиенте, иначе иконка. */
@Component({
  selector: 'memo-avatar',
  standalone: true,
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="memo-avatar" [class.memo-avatar--large]="large()">
      @if (photoUrl(); as url) {
        <img class="photo" [src]="url" alt="" referrerpolicy="no-referrer" />
      } @else if (initials()) {
        {{ initials() }}
      } @else {
        <memo-icon name="user" [size]="large() ? 26 : 20" />
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .memo-avatar {
      overflow: hidden;
    }
    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  `,
})
export class AvatarComponent {
  readonly initials = input<string>('');
  readonly photoUrl = input<string | null>(null);
  readonly large = input<boolean>(false);
}
