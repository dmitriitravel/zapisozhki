import { ProcessedImage } from '../../core/models/interfaces';

export interface CardEditorForm {
  readonly question: string;
  readonly answer: string;
  /** Идентификатор уже сохранённого изображения (при редактировании). */
  readonly existingImageId: string | null;
  readonly existingThumbnail: string | null;
  /** Новое изображение, выбранное пользователем, но ещё не сохранённое. */
  readonly pendingImage: ProcessedImage | null;
}
