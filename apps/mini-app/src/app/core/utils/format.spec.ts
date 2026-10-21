import { formatInitials } from './format';

describe('formatInitials', () => {
  it('берёт первые буквы имени и фамилии', () => {
    expect(formatInitials('Мария Иванова')).toBe('МИ');
    expect(formatInitials('  anna   maria   smith ')).toBe('AS');
  });

  it('для одного слова возвращает одну букву, для пустой строки — ничего', () => {
    expect(formatInitials('anna')).toBe('A');
    expect(formatInitials('   ')).toBe('');
  });
});
