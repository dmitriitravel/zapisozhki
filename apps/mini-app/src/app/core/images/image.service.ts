import { Injectable, inject } from '@angular/core';
import { MemoRepository } from '../db/memo-repository.service';
import { ProcessedImage, StoredImage } from '../models/interfaces';
import { createId } from '../utils/id';

const MAX_IMAGE_SIDE = 1280;
const THUMBNAIL_SIDE = 160;
const JPEG_QUALITY = 0.85;
const CACHE_LIMIT = 30;

/**
 * Обработка и хранение изображений карточек.
 * Файл ужимается до 1280px по большей стороне и сохраняется как JPEG data URL,
 * отдельно создаётся превью 160px для списков.
 */
@Injectable({ providedIn: 'root' })
export class ImageService {
  private readonly repository = inject(MemoRepository);
  private readonly cache = new Map<string, string>();

  async processFile(file: File): Promise<ProcessedImage> {
    const source = await this.loadImage(file);
    const full = this.render(source, MAX_IMAGE_SIDE);
    const thumbnail = this.render(source, THUMBNAIL_SIDE);
    const image: StoredImage = {
      id: createId(),
      dataUrl: full.dataUrl,
      width: full.width,
      height: full.height,
      createdAt: Date.now(),
    };
    return { full: image, thumbnailDataUrl: thumbnail.dataUrl };
  }

  /** Загружает изображение из assets (для колод библиотеки). */
  async processUrl(url: string): Promise<ProcessedImage> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Не удалось загрузить изображение: ${url}`);
    }
    const blob = await response.blob();
    const file = new File([blob], 'image', { type: blob.type });
    return this.processFile(file);
  }

  async save(image: StoredImage): Promise<void> {
    await this.repository.putImage(image);
    this.remember(image.id, image.dataUrl);
  }

  async getDataUrl(imageId: string): Promise<string | null> {
    const cached = this.cache.get(imageId);
    if (cached) {
      return cached;
    }
    const image = await this.repository.getImage(imageId);
    if (!image) {
      return null;
    }
    this.remember(imageId, image.dataUrl);
    return image.dataUrl;
  }

  async delete(imageId: string): Promise<void> {
    await this.repository.deleteImage(imageId);
    this.cache.delete(imageId);
  }

  private remember(imageId: string, dataUrl: string): void {
    if (this.cache.size >= CACHE_LIMIT) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(imageId, dataUrl);
  }

  private loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Не удалось прочитать изображение'));
      };
      image.src = url;
    });
  }

  private render(
    source: HTMLImageElement,
    maxSide: number
  ): { dataUrl: string; width: number; height: number } {
    const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Canvas недоступен');
    }
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width, height };
  }
}
