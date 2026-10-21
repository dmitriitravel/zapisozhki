import {
  describeSpeechRate,
  detectSpeechLanguage,
  toWebSpeechRate,
} from './speech-language';

describe('detectSpeechLanguage', () => {
  it('распознаёт кириллицу как русский, украинский и казахский', () => {
    expect(detectSpeechLanguage('Привет, мир')).toBe('ru-RU');
    expect(detectSpeechLanguage('Привіт, світе')).toBe('uk-UA');
    expect(detectSpeechLanguage('Сәлем әлем')).toBe('kk-KZ');
  });

  it('распознаёт письменности других языков', () => {
    expect(detectSpeechLanguage('こんにちは')).toBe('ja-JP');
    expect(detectSpeechLanguage('안녕하세요')).toBe('ko-KR');
    expect(detectSpeechLanguage('你好')).toBe('zh-CN');
    expect(detectSpeechLanguage('مرحبا')).toBe('ar-SA');
    expect(detectSpeechLanguage('שלום')).toBe('he-IL');
  });

  it('по характерным буквам отличает европейские языки, иначе — английский', () => {
    expect(detectSpeechLanguage('Straße')).toBe('de-DE');
    expect(detectSpeechLanguage('¿Qué tal?')).toBe('es-ES');
    expect(detectSpeechLanguage('Garçon, s’il vous plaît')).toBe('fr-FR');
    expect(detectSpeechLanguage('to cost an arm and a leg')).toBe('en-US');
  });
});

describe('toWebSpeechRate', () => {
  it('переводит шкалу настроек (0.5 — обычно) в шкалу Web Speech (1 — обычно) и ограничивает диапазон', () => {
    expect(toWebSpeechRate(0.5)).toBe(1);
    expect(toWebSpeechRate(0.25)).toBe(0.5);
    expect(toWebSpeechRate(2)).toBe(1.4);
    expect(toWebSpeechRate(0)).toBe(0.4);
  });
});

describe('describeSpeechRate', () => {
  it('подписывает скорость словами', () => {
    expect(describeSpeechRate(0.2)).toBe('Медленно');
    expect(describeSpeechRate(0.5)).toBe('Обычно');
    expect(describeSpeechRate(0.7)).toBe('Быстро');
  });
});
