import { DOCUMENT } from '@angular/common';
import { Injectable, NgZone, inject, signal } from '@angular/core';
import { MemoStore } from '../store/memo-store.service';
import { detectSpeechLanguage, toWebSpeechRate } from './speech-language';

/**
 * Озвучивание текста карточек через Web Speech API (speechSynthesis).
 * Голос подбирается по языку, определённому из текста; скорость — из настроек.
 * Если синтез речи в WebView недоступен, методы ничего не делают.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private readonly store = inject(MemoStore);

  private readonly speakingState = signal(false);
  private readonly speakingTextState = signal<string | null>(null);

  readonly isSpeaking = this.speakingState.asReadonly();
  /** Текст, который озвучивается сейчас (чтобы подсветить нужную кнопку). */
  readonly speakingText = this.speakingTextState.asReadonly();

  isAvailable(): boolean {
    return this.getSynth() !== null;
  }

  speak(text: string): void {
    const synth = this.getSynth();
    const trimmed = text.trim();
    if (!synth || !trimmed) {
      return;
    }
    synth.cancel();

    const language = detectSpeechLanguage(trimmed);
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = language;
    utterance.rate = toWebSpeechRate(this.store.settings().speechRate);
    const voice = pickVoice(synth.getVoices(), language);
    if (voice) {
      utterance.voice = voice;
    }
    const finish = (): void =>
      this.zone.run(() => {
        this.speakingState.set(false);
        this.speakingTextState.set(null);
      });
    utterance.onend = finish;
    utterance.onerror = finish;

    this.speakingState.set(true);
    this.speakingTextState.set(trimmed);
    synth.speak(utterance);
  }

  /** Повторное нажатие на динамик во время речи останавливает её. */
  toggle(text: string): void {
    if (this.speakingState() && this.speakingTextState() === text.trim()) {
      this.stop();
      return;
    }
    this.speak(text);
  }

  stop(): void {
    this.getSynth()?.cancel();
    this.speakingState.set(false);
    this.speakingTextState.set(null);
  }

  private getSynth(): SpeechSynthesis | null {
    const view = this.document.defaultView;
    if (!view || typeof view.speechSynthesis === 'undefined') {
      return null;
    }
    return view.speechSynthesis;
  }
}

/** Голос с точным совпадением языка, иначе — с совпадением по первым двум буквам. */
function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: string
): SpeechSynthesisVoice | null {
  const normalized = language.toLowerCase().replace('_', '-');
  const prefix = normalized.slice(0, 2);
  const exact = voices.filter(
    (voice) => voice.lang.toLowerCase().replace('_', '-') === normalized
  );
  const partial = voices.filter((voice) =>
    voice.lang.toLowerCase().startsWith(prefix)
  );
  const candidates = exact.length > 0 ? exact : partial;
  // Предпочитаем «улучшенные»/локальные голоса, если они есть.
  const ranked = [...candidates].sort((a, b) => rankVoice(b) - rankVoice(a));
  return ranked[0] ?? null;
}

function rankVoice(voice: SpeechSynthesisVoice): number {
  const name = voice.name.toLowerCase();
  const premium = name.includes('premium') || name.includes('enhanced') ? 2 : 0;
  return premium + (voice.localService ? 1 : 0) + (voice.default ? 0.5 : 0);
}
