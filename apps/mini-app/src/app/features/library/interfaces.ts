import { LibraryIndexEntry } from '../../core/models/interfaces';

export interface LibraryListItem {
  readonly entry: LibraryIndexEntry;
  readonly installed: boolean;
}
