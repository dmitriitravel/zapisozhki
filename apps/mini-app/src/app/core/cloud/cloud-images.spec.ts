import { dataUrlToBlob, imageStoragePath } from './cloud-images';

describe('cloud-images', () => {
  it('путь в Storage начинается с папки пользователя (её проверяет RLS)', () => {
    expect(imageStoragePath('user-1', 'img-1')).toBe('user-1/img-1');
  });

  it('разбирает base64 data URL в Blob с нужным типом', async () => {
    const blob = dataUrlToBlob('data:image/jpeg;base64,/9j/4AAQ');
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('image/jpeg');
    expect(blob?.size).toBe(6);
  });

  it('разбирает текстовый data URL без base64', async () => {
    const blob = dataUrlToBlob('data:text/plain,hello%20world');
    expect(blob?.type).toBe('text/plain');
    expect(blob?.size).toBe('hello world'.length);
  });

  it('возвращает null для строки, не похожей на data URL', () => {
    expect(dataUrlToBlob('https://example.com/a.jpg')).toBeNull();
    expect(dataUrlToBlob('')).toBeNull();
  });
});
