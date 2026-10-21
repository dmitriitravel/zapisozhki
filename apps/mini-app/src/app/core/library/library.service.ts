import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ImageService } from '../images/image.service';
import {
  CardDraft,
  Deck,
  LibraryDeck,
  LibraryIndexEntry,
} from '../models/interfaces';
import { MemoStore } from '../store/memo-store.service';

const LIBRARY_BASE = 'assets/library';

/** Готовые колоды, поставляемые вместе с приложением (assets/library). */
@Injectable({ providedIn: 'root' })
export class LibraryService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(MemoStore);
  private readonly images = inject(ImageService);

  private readonly entriesState = signal<readonly LibraryIndexEntry[]>([]);
  private readonly loadingState = signal(false);

  readonly entries = this.entriesState.asReadonly();
  readonly isLoading = this.loadingState.asReadonly();

  async loadIndex(): Promise<void> {
    if (this.entriesState().length > 0) {
      return;
    }
    this.loadingState.set(true);
    try {
      const entries = await firstValueFrom(
        this.http.get<readonly LibraryIndexEntry[]>(`${LIBRARY_BASE}/index.json`)
      );
      this.entriesState.set(entries);
    } finally {
      this.loadingState.set(false);
    }
  }

  /** Уже добавлена ли колода из библиотеки в «Мои колоды». */
  isInstalled(libraryId: string): boolean {
    return this.store.decks().some((deck) => deck.libraryId === libraryId);
  }

  async install(entry: LibraryIndexEntry): Promise<Deck> {
    const libraryDeck = await firstValueFrom(
      this.http.get<LibraryDeck>(`${LIBRARY_BASE}/${entry.file}`)
    );
    const deck = await this.store.createDeck(
      {
        title: libraryDeck.title,
        description: libraryDeck.description,
        emoji: libraryDeck.emoji,
      },
      libraryDeck.id
    );
    const drafts = await Promise.all(
      libraryDeck.cards.map((card) => this.toDraft(card.question, card.answer, card.imageUrl))
    );
    await this.store.createCards(deck.id, drafts);
    return deck;
  }

  private async toDraft(
    question: string,
    answer: string,
    imageUrl: string | undefined
  ): Promise<CardDraft> {
    if (!imageUrl) {
      return { question, answer, imageId: null, thumbnailDataUrl: null };
    }
    try {
      const processed = await this.images.processUrl(`${LIBRARY_BASE}/${imageUrl}`);
      await this.images.save(processed.full);
      return {
        question,
        answer,
        imageId: processed.full.id,
        thumbnailDataUrl: processed.thumbnailDataUrl,
      };
    } catch {
      return { question, answer, imageId: null, thumbnailDataUrl: null };
    }
  }
}
