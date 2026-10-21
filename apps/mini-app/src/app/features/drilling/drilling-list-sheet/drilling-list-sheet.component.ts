import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { TelegramService } from '@memo/shared/telegram';
import { Card } from '../../../core/models/interfaces';
import { SpeechService } from '../../../core/speech/speech.service';
import { CardStateLabel } from '../../../core/study/interfaces';
import { StudySession } from '../../../core/study/study-session.service';
import { StudyService } from '../../../core/study/study.service';
import { BottomSheetComponent } from '../../../ui/bottom-sheet/bottom-sheet.component';
import { CardListItemComponent } from '../../../ui/card-list-item/card-list-item.component';
import { DrillingListTab } from '../interfaces';

/**
 * Шторка Drilling list: карточки текущей сессии («Сегодня») или все карточки области («Все»)
 * с бейджем состояния, озвучкой и меню.
 */
@Component({
  selector: 'memo-drilling-list-sheet',
  standalone: true,
  imports: [BottomSheetComponent, CardListItemComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drilling-list-sheet.component.html',
  styleUrl: './drilling-list-sheet.component.scss',
})
export class DrillingListSheetComponent {
  readonly open = output<Card>();
  readonly menu = output<Card>();
  readonly closed = output<void>();

  private readonly session = inject(StudySession);
  private readonly study = inject(StudyService);
  private readonly speech = inject(SpeechService);
  private readonly telegram = inject(TelegramService);

  private readonly tabState = signal<DrillingListTab>('today');

  readonly tab = this.tabState.asReadonly();
  readonly todayCards = this.session.queueCards;
  readonly allCards = this.session.scopedCards;
  readonly cards = computed(() =>
    this.tabState() === 'today' ? this.todayCards() : this.allCards()
  );
  readonly summary = this.session.summary;
  readonly speakingText = this.speech.speakingText;
  readonly canSpeak = this.speech.isAvailable();

  setTab(tab: DrillingListTab): void {
    if (this.tabState() === tab) {
      return;
    }
    this.telegram.hapticSelection();
    this.tabState.set(tab);
  }

  describe(card: Card): CardStateLabel {
    return this.study.describeState(card, this.session.tick());
  }

  isSpeaking(card: Card): boolean {
    return this.speakingText() === card.question.trim();
  }

  speak(card: Card): void {
    this.speech.toggle(card.question);
  }
}
