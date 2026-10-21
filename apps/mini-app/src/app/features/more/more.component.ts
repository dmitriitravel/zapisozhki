import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { TelegramService } from '@memo/shared/telegram';
import { BackupService } from '../../core/backup/backup.service';
import { SyncService } from '../../core/cloud/sync.service';
import { SyncStatus } from '../../core/cloud/interfaces';
import { AppSettings, BackupSummary, StudyStats } from '../../core/models/interfaces';
import { ProfileService } from '../../core/profile/profile.service';
import {
  SPEECH_RATE_MAX,
  SPEECH_RATE_MIN,
  SPEECH_RATE_STEP,
  describeSpeechRate,
} from '../../core/speech/speech-language';
import { SpeechService } from '../../core/speech/speech.service';
import { StatsService } from '../../core/stats/stats.service';
import { MemoStore } from '../../core/store/memo-store.service';
import { ToastService } from '../../core/toast/toast.service';
import { formatCount, formatDate, formatTime } from '../../core/utils/format';
import { AvatarComponent } from '../../ui/avatar/avatar.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { IconName } from '../../ui/icon/icons';
import { PageHeaderComponent } from '../../ui/page-header/page-header.component';
import { ActivityChartComponent } from './activity-chart/activity-chart.component';
import {
  BackupOperation,
  NEW_CARDS_PER_DAY_MAX,
  NEW_CARDS_PER_DAY_MIN,
  NEW_CARDS_PER_DAY_STEP,
  SPEECH_TEST_PHRASE,
  SyncPresentation,
  USER_NAME_MAX_LENGTH,
} from './interfaces';
import { RetentionChartsComponent } from './retention-charts/retention-charts.component';

const USER_NAME_SAVE_DELAY_MS = 400;

@Component({
  selector: 'memo-more',
  standalone: true,
  imports: [
    PageHeaderComponent,
    IconComponent,
    AvatarComponent,
    ActivityChartComponent,
    RetentionChartsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './more.component.html',
  styleUrl: './more.component.scss',
})
export class MoreComponent implements OnInit {
  private readonly store = inject(MemoStore);
  private readonly stats = inject(StatsService);
  private readonly backup = inject(BackupService);
  private readonly profile = inject(ProfileService);
  private readonly speech = inject(SpeechService);
  private readonly sync = inject(SyncService);
  private readonly telegram = inject(TelegramService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly importInput = viewChild<ElementRef<HTMLInputElement>>('importInput');

  private readonly statsState = signal<StudyStats | null>(null);
  private readonly cloudSummaryState = signal<BackupSummary | null>(null);
  private readonly operationState = signal<BackupOperation>(null);
  private userNameTimer: ReturnType<typeof setTimeout> | null = null;

  readonly settings = this.store.settings;
  readonly studyStats = this.statsState.asReadonly();
  readonly cloudSummary = this.cloudSummaryState.asReadonly();
  readonly operation = this.operationState.asReadonly();
  readonly isBusy = computed(() => this.operationState() !== null);
  readonly isCloudAvailable = this.backup.isCloudAvailable();
  readonly isInsideTelegram = this.telegram.isAvailable();
  readonly canSpeak = this.speech.isAvailable();
  readonly isSpeaking = this.speech.isSpeaking;
  readonly displayName = this.profile.displayName;
  readonly initials = this.profile.initials;
  readonly photoUrl = this.profile.photoUrl;
  readonly userNameMaxLength = USER_NAME_MAX_LENGTH;
  readonly speechRateMin = SPEECH_RATE_MIN;
  readonly speechRateMax = SPEECH_RATE_MAX;
  readonly speechRateStep = SPEECH_RATE_STEP;
  readonly speechRateLabel = computed(() => describeSpeechRate(this.store.settings().speechRate));
  readonly canDecrease = computed(
    () => this.store.settings().newCardsPerDay > NEW_CARDS_PER_DAY_MIN
  );
  readonly canIncrease = computed(
    () => this.store.settings().newCardsPerDay < NEW_CARDS_PER_DAY_MAX
  );
  readonly isCloudSyncAvailable = this.sync.isAvailable();
  readonly syncStatus = this.sync.status;
  readonly syncView = computed((): SyncPresentation => describeSync(this.sync.status()));

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.speech.stop();
      if (this.userNameTimer) {
        clearTimeout(this.userNameTimer);
      }
    });
  }

  ngOnInit(): void {
    void this.refreshStats();
    void this.refreshCloudSummary();
  }

  async changeNewCardsPerDay(direction: 1 | -1): Promise<void> {
    const current = this.store.settings().newCardsPerDay;
    const next = Math.min(
      NEW_CARDS_PER_DAY_MAX,
      Math.max(NEW_CARDS_PER_DAY_MIN, current + direction * NEW_CARDS_PER_DAY_STEP)
    );
    if (next === current) {
      return;
    }
    this.telegram.hapticSelection();
    await this.store.updateSettings({ newCardsPerDay: next });
  }

  async toggle(key: 'swipeToRate' | 'imageOnlyFront' | 'autoSpeak'): Promise<void> {
    this.telegram.hapticSelection();
    const patch: Partial<AppSettings> = { [key]: !this.store.settings()[key] };
    await this.store.updateSettings(patch);
  }

  async setSpeechRate(value: string): Promise<void> {
    const rate = Number.parseFloat(value);
    if (Number.isNaN(rate)) {
      return;
    }
    await this.store.updateSettings({ speechRate: rate });
  }

  testSpeech(): void {
    this.speech.toggle(SPEECH_TEST_PHRASE);
  }

  async syncNow(): Promise<void> {
    this.telegram.hapticSelection();
    await this.sync.syncNow();
    const status = this.sync.status();
    if (status.state === 'idle') {
      this.toast.success('Данные синхронизированы');
      await this.refreshStats();
    } else if (status.state === 'error') {
      this.toast.error(status.message);
    }
  }

  /** Имя сохраняем с небольшой задержкой, чтобы не писать в базу на каждую букву. */
  setUserName(value: string): void {
    if (this.userNameTimer) {
      clearTimeout(this.userNameTimer);
    }
    this.userNameTimer = setTimeout(() => {
      this.userNameTimer = null;
      void this.store.updateSettings({ userName: value.slice(0, USER_NAME_MAX_LENGTH) });
    }, USER_NAME_SAVE_DELAY_MS);
  }

  async saveToCloud(): Promise<void> {
    await this.run('cloud-save', async () => {
      const summary = await this.backup.saveToCloud();
      this.cloudSummaryState.set(summary);
      this.toast.success('Резервная копия сохранена в Telegram');
    });
  }

  async restoreFromCloud(): Promise<void> {
    const summary = this.cloudSummaryState();
    if (!summary) {
      return;
    }
    const confirmed = await this.telegram.showConfirm(
      `Заменить текущие данные копией от ${formatDate(summary.exportedAt)}? Изображения в облачной копии не хранятся.`
    );
    if (!confirmed) {
      return;
    }
    await this.run('cloud-restore', async () => {
      const restored = await this.backup.restoreFromCloud();
      this.toast.success(
        `Восстановлено: ${formatCount(restored.deckCount, ['колода', 'колоды', 'колод'])}`
      );
      await this.refreshStats();
    });
  }

  async exportToFile(): Promise<void> {
    await this.run('export', async () => {
      await this.backup.exportToFile();
      this.toast.show('Файл подготовлен к скачиванию');
    });
  }

  pickImportFile(): void {
    this.importInput()?.nativeElement.click();
  }

  async onImportFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const confirmed = await this.telegram.showConfirm(
      'Импорт заменит все текущие колоды и карточки. Продолжить?'
    );
    if (!confirmed) {
      return;
    }
    await this.run('import', async () => {
      const summary = await this.backup.importFromFile(file);
      this.toast.success(
        `Импортировано: ${formatCount(summary.cardCount, ['карточка', 'карточки', 'карточек'])}`
      );
      await this.refreshStats();
    });
  }

  formatDate(timestamp: number): string {
    return formatDate(timestamp);
  }

  formatDays(count: number): string {
    return formatCount(count, ['день', 'дня', 'дней']);
  }

  private async run(operation: BackupOperation, action: () => Promise<void>): Promise<void> {
    if (this.operationState()) {
      return;
    }
    this.operationState.set(operation);
    try {
      await action();
      this.telegram.hapticNotification('success');
    } catch (error) {
      this.telegram.hapticNotification('error');
      this.toast.error(error instanceof Error ? error.message : 'Что-то пошло не так');
    } finally {
      this.operationState.set(null);
    }
  }

  private async refreshStats(): Promise<void> {
    this.statsState.set(await this.stats.compute());
  }

  private async refreshCloudSummary(): Promise<void> {
    if (!this.isCloudAvailable) {
      return;
    }
    try {
      this.cloudSummaryState.set(await this.backup.getCloudSummary());
    } catch {
      this.cloudSummaryState.set(null);
    }
  }
}

function describeSync(status: SyncStatus): SyncPresentation {
  const pending =
    status.pendingCount > 0
      ? ` · в очереди ${formatCount(status.pendingCount, ['изменение', 'изменения', 'изменений'])}`
      : '';
  const icon: IconName =
    status.state === 'idle'
      ? 'cloud-check'
      : status.state === 'error' || status.state === 'offline'
        ? 'cloud-off'
        : 'cloud';
  switch (status.state) {
    case 'disabled':
      return { icon, title: 'Облако отключено', subtitle: status.message, tone: 'muted' };
    case 'unauthenticated':
      return { icon, title: 'Нет входа', subtitle: status.message, tone: 'muted' };
    case 'syncing':
      return { icon, title: 'Синхронизация…', subtitle: 'Сверяем данные с облаком', tone: 'accent' };
    case 'offline':
      return { icon, title: 'Нет сети', subtitle: `${status.message}${pending}`, tone: 'warning' };
    case 'error':
      return { icon, title: 'Ошибка синхронизации', subtitle: `${status.message}${pending}`, tone: 'danger' };
    case 'idle':
      return {
        icon,
        title: 'Данные в облаке',
        subtitle: status.lastSyncAt
          ? `Синхронизировано в ${formatTime(status.lastSyncAt)}${pending}`
          : 'Готово к синхронизации',
        tone: 'success',
      };
  }
}
