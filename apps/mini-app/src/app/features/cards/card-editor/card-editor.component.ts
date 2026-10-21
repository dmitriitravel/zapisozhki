import { DOCUMENT, Location } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TelegramService } from '@memo/shared/telegram';
import { ImageService } from '../../../core/images/image.service';
import { CardDraft } from '../../../core/models/interfaces';
import { SpeechService } from '../../../core/speech/speech.service';
import { MemoStore } from '../../../core/store/memo-store.service';
import { ToastService } from '../../../core/toast/toast.service';
import { CardImageComponent } from '../../../ui/card-image/card-image.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import { CardEditorForm } from '../interfaces';

const EMPTY_FORM: CardEditorForm = {
  question: '',
  answer: '',
  existingImageId: null,
  existingThumbnail: null,
  pendingImage: null,
};

@Component({
  selector: 'memo-card-editor',
  standalone: true,
  imports: [PageHeaderComponent, IconComponent, CardImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card-editor.component.html',
  styleUrl: './card-editor.component.scss',
})
export class CardEditorComponent {
  readonly deckId = input.required<string>();
  readonly cardId = input<string>();

  private readonly store = inject(MemoStore);
  private readonly images = inject(ImageService);
  private readonly speech = inject(SpeechService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('fileInput');
  private readonly questionInput = viewChild<ElementRef<HTMLTextAreaElement>>('questionInput');

  private readonly formState = signal<CardEditorForm>(EMPTY_FORM);
  private readonly busyState = signal(false);
  private readonly imageLoadingState = signal(false);

  readonly form = this.formState.asReadonly();
  readonly isBusy = this.busyState.asReadonly();
  readonly isImageLoading = this.imageLoadingState.asReadonly();
  readonly isEdit = computed(() => Boolean(this.cardId()));
  readonly deck = computed(() => this.store.getDeckById(this.deckId()));
  readonly canSpeak = this.speech.isAvailable();
  readonly canReadClipboard = this.detectClipboardRead();
  readonly isSpeaking = computed(
    () => this.speech.speakingText() === this.formState().question.trim()
  );
  readonly hasImage = computed(() => {
    const form = this.formState();
    return form.pendingImage !== null || form.existingImageId !== null;
  });
  /** Как в Mac-версии: достаточно вопроса или изображения. */
  readonly canSave = computed(() => {
    const form = this.formState();
    return (
      (form.question.trim().length > 0 || this.hasImage()) &&
      !this.busyState() &&
      !this.imageLoadingState()
    );
  });
  /** Что показывать в превью: новое изображение или уже сохранённое. */
  readonly pendingPreview = computed(
    () => this.formState().pendingImage?.full.dataUrl ?? null
  );

  constructor() {
    effect(() => {
      const id = this.cardId();
      untracked(() => this.prefill(id));
    });

    // Вставка изображения из буфера обмена (⌘V / долгое нажатие → «Вставить»).
    const onPaste = (event: Event): void => {
      void this.onPaste(event as ClipboardEvent);
    };
    this.document.addEventListener('paste', onPaste);
    this.destroyRef.onDestroy(() => {
      this.document.removeEventListener('paste', onPaste);
      this.speech.stop();
    });
  }

  setQuestion(value: string): void {
    this.formState.update((form) => ({ ...form, question: value }));
  }

  setAnswer(value: string): void {
    this.formState.update((form) => ({ ...form, answer: value }));
  }

  pickImage(): void {
    this.fileInput()?.nativeElement.click();
  }

  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      await this.applyImageFile(file);
    }
  }

  /** Кнопка «Буфер»: читаем изображение через Clipboard API, если он доступен. */
  async pasteFromClipboard(): Promise<void> {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    if (!clipboard || typeof clipboard.read !== 'function') {
      this.toast.show('Вставьте изображение долгим нажатием на поле вопроса');
      return;
    }
    try {
      const items = await clipboard.read();
      const file = await firstImageFromClipboardItems(items);
      if (!file) {
        this.toast.show('В буфере обмена нет изображения');
        return;
      }
      await this.applyImageFile(file);
    } catch {
      this.toast.error('Нет доступа к буферу обмена');
    }
  }

  removeImage(): void {
    this.formState.update((form) => ({
      ...form,
      pendingImage: null,
      existingImageId: null,
      existingThumbnail: null,
    }));
  }

  speakQuestion(): void {
    this.speech.toggle(this.formState().question);
  }

  cancel(): void {
    this.location.back();
  }

  async save(addAnother = false): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.busyState.set(true);
    try {
      const draft = await this.buildDraft();
      const id = this.cardId();
      if (id) {
        await this.store.updateCard(id, draft);
        this.toast.success('Карточка сохранена');
        this.telegram.hapticNotification('success');
        this.location.back();
        return;
      }
      await this.store.createCard(this.deckId(), draft);
      this.telegram.hapticNotification('success');
      if (addAnother) {
        this.toast.success('Добавлено. Следующая карточка');
        this.formState.set(EMPTY_FORM);
        this.questionInput()?.nativeElement.focus();
      } else {
        this.toast.success('Карточка добавлена');
        this.location.back();
      }
    } finally {
      this.busyState.set(false);
    }
  }

  async remove(): Promise<void> {
    const id = this.cardId();
    if (!id) {
      return;
    }
    const confirmed = await this.telegram.showConfirm('Удалить карточку?');
    if (!confirmed) {
      return;
    }
    await this.store.deleteCard(id);
    this.toast.show('Карточка удалена');
    await this.router.navigate(['/decks', this.deckId()], { replaceUrl: true });
  }

  private async onPaste(event: ClipboardEvent): Promise<void> {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith('image/'));
    const file = imageItem?.getAsFile() ?? null;
    if (!file) {
      return;
    }
    event.preventDefault();
    await this.applyImageFile(file);
  }

  private async applyImageFile(file: File): Promise<void> {
    this.imageLoadingState.set(true);
    try {
      const processed = await this.images.processFile(file);
      this.formState.update((form) => ({ ...form, pendingImage: processed }));
      this.telegram.hapticImpact('light');
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Ошибка изображения');
    } finally {
      this.imageLoadingState.set(false);
    }
  }

  private async buildDraft(): Promise<CardDraft> {
    const form = this.formState();
    if (form.pendingImage) {
      await this.images.save(form.pendingImage.full);
      return {
        question: form.question,
        answer: form.answer,
        imageId: form.pendingImage.full.id,
        thumbnailDataUrl: form.pendingImage.thumbnailDataUrl,
      };
    }
    return {
      question: form.question,
      answer: form.answer,
      imageId: form.existingImageId,
      thumbnailDataUrl: form.existingThumbnail,
    };
  }

  private prefill(cardId: string | undefined): void {
    if (!cardId) {
      this.formState.set(EMPTY_FORM);
      return;
    }
    const card = this.store.getCardById(cardId);
    if (!card) {
      return;
    }
    this.formState.set({
      question: card.question,
      answer: card.answer,
      existingImageId: card.imageId,
      existingThumbnail: card.thumbnailDataUrl,
      pendingImage: null,
    });
  }

  private detectClipboardRead(): boolean {
    const clipboard = this.document.defaultView?.navigator.clipboard;
    return Boolean(clipboard && typeof clipboard.read === 'function');
  }
}

async function firstImageFromClipboardItems(
  items: readonly ClipboardItem[]
): Promise<File | null> {
  const candidates = items.flatMap((item) =>
    item.types.filter((type) => type.startsWith('image/')).map((type) => ({ item, type }))
  );
  const first = candidates[0];
  if (!first) {
    return null;
  }
  const blob = await first.item.getType(first.type);
  return new File([blob], 'clipboard', { type: first.type });
}
