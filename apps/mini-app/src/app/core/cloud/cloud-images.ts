import { StoredImage } from '../models/interfaces';

const DATA_URL_PATTERN = /^data:([^;,]+)?(;base64)?,(.*)$/s;

/** Путь объекта в бакете card-images: политики RLS проверяют первую папку = user_id. */
export function imageStoragePath(userId: string, imageId: string): string {
  return `${userId}/${imageId}`;
}

/** Преобразует data URL (base64) в Blob. Возвращает null, если строка не похожа на data URL. */
export function dataUrlToBlob(dataUrl: string): Blob | null {
  const match = DATA_URL_PATTERN.exec(dataUrl);
  if (!match) {
    return null;
  }
  const [, mime = 'application/octet-stream', isBase64, payload] = match;
  const bytes = isBase64
    ? Uint8Array.from(atob(payload), (char) => char.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(payload));
  return new Blob([bytes], { type: mime });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(blob);
  });
}

async function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap !== 'function') {
    return { width: 0, height: 0 };
  }
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}

/** Собирает StoredImage из скачанного из облака файла. */
export async function storedImageFromBlob(imageId: string, blob: Blob): Promise<StoredImage> {
  const [dataUrl, size] = await Promise.all([blobToDataUrl(blob), readImageSize(blob)]);
  return { id: imageId, dataUrl, width: size.width, height: size.height, createdAt: Date.now() };
}
