import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { ImageService } from '../../core/images/image.service';

/** Показывает полноразмерное изображение карточки по его идентификатору. */
@Component({
  selector: 'memo-card-image',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dataUrl(); as url) {
      <img class="image" [src]="url" alt="" />
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .image {
      display: block;
      width: 100%;
      max-height: 40vh;
      object-fit: contain;
      border-radius: 12px;
      background: var(--memo-secondary-bg);
    }
  `,
})
export class CardImageComponent {
  readonly imageId = input<string | null>(null);

  private readonly images = inject(ImageService);
  private readonly dataUrlState = signal<string | null>(null);

  readonly dataUrl = this.dataUrlState.asReadonly();

  constructor() {
    effect(() => {
      const id = this.imageId();
      untracked(() => this.load(id));
    });
  }

  private async load(imageId: string | null): Promise<void> {
    if (!imageId) {
      this.dataUrlState.set(null);
      return;
    }
    const url = await this.images.getDataUrl(imageId);
    if (this.imageId() === imageId) {
      this.dataUrlState.set(url);
    }
  }
}
