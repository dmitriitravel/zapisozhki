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
import { ImageFit } from '../interfaces';

/**
 * Показывает полноразмерное изображение карточки по его идентификатору.
 * Размер задаёт родитель (host — блочный элемент), картинка заполняет его целиком:
 * fit="contain" — вписать, fit="cover" — заполнить с обрезкой (лицевая сторона «только картинка»).
 */
@Component({
  selector: 'memo-card-image',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dataUrl(); as url) {
      <img class="image" [src]="url" [style.object-fit]="fit()" alt="" />
    } @else {
      <div class="placeholder"></div>
    }
  `,
  styles: `
    :host {
      display: block;
      overflow: hidden;
      border-radius: 12px;
      background: var(--memo-secondary-bg);
    }
    .image,
    .placeholder {
      display: block;
      width: 100%;
      height: 100%;
    }
    .image {
      object-fit: contain;
    }
  `,
})
export class CardImageComponent {
  readonly imageId = input<string | null>(null);
  readonly fit = input<ImageFit>('contain');

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
