import { LibraryIndexEntry } from '../../core/models/interfaces';

export interface LibraryListItem {
  readonly entry: LibraryIndexEntry;
  /** Идентификатор колоды пользователя, если библиотечная колода уже добавлена. */
  readonly installedDeckId: string | null;
}
