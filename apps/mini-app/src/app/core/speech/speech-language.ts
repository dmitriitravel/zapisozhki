/** Границы скорости речи в настройках (совпадают с Mac-версией). */
export const SPEECH_RATE_MIN = 0.2;
export const SPEECH_RATE_MAX = 0.7;
export const SPEECH_RATE_STEP = 0.05;

const SCRIPT_LANGUAGES: readonly (readonly [RegExp, string])[] = [
  [/[\u3040-\u30ff]/u, 'ja-JP'],
  [/[\uac00-\ud7af]/u, 'ko-KR'],
  [/[\u4e00-\u9fff]/u, 'zh-CN'],
  [/[\u0600-\u06ff]/u, 'ar-SA'],
  [/[\u0590-\u05ff]/u, 'he-IL'],
  [/[\u0900-\u097f]/u, 'hi-IN'],
  [/[\u0370-\u03ff]/u, 'el-GR'],
];

const CYRILLIC = /[\u0400-\u04ff]/u;
const UKRAINIAN = /[іїєґІЇЄҐ]/u;
const KAZAKH = /[әғқңөұүһӘҒҚҢӨҰҮҺ]/u;

const LATIN_LANGUAGES: readonly (readonly [RegExp, string])[] = [
  [/[äöüßÄÖÜ]/u, 'de-DE'],
  [/[ñ¿¡]/u, 'es-ES'],
  [/[ãõ]/u, 'pt-BR'],
  [/[łęąśżźćń]/iu, 'pl-PL'],
  [/[ğşıİ]/u, 'tr-TR'],
  [/[ěřůň]/iu, 'cs-CZ'],
  [/[çœèêëàâûùîïÿ]/iu, 'fr-FR'],
];

/**
 * Определяет язык озвучки по письменности и характерным буквам.
 * Это упрощённый аналог NLLanguageRecognizer из Mac-версии: для карточек
 * «иностранное слово — перевод» этого достаточно.
 */
export function detectSpeechLanguage(text: string): string {
  if (CYRILLIC.test(text)) {
    if (KAZAKH.test(text)) {
      return 'kk-KZ';
    }
    if (UKRAINIAN.test(text)) {
      return 'uk-UA';
    }
    return 'ru-RU';
  }
  const byScript = SCRIPT_LANGUAGES.find(([pattern]) => pattern.test(text));
  if (byScript) {
    return byScript[1];
  }
  const byLetters = LATIN_LANGUAGES.find(([pattern]) => pattern.test(text));
  return byLetters ? byLetters[1] : 'en-US';
}

/**
 * Скорость в настройках хранится в шкале AVSpeechSynthesizer (0.5 — обычная),
 * у Web Speech API обычная скорость равна 1.
 */
export function toWebSpeechRate(settingsRate: number): number {
  const clamped = Math.min(SPEECH_RATE_MAX, Math.max(SPEECH_RATE_MIN, settingsRate));
  return Math.round(clamped * 2 * 100) / 100;
}

/** Подпись к скорости для настроек: «Медленно», «Обычно», «Быстро». */
export function describeSpeechRate(settingsRate: number): string {
  if (settingsRate < 0.4) {
    return 'Медленно';
  }
  if (settingsRate > 0.6) {
    return 'Быстро';
  }
  return 'Обычно';
}
