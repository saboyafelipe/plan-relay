// describe, it and expect come from the vitest globals (the root vitest.config.mts turns them on for every workspace).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ptBR from '../pt-BR.json';
import xTest from '../x-test.json';
import en from '../en.json';
import { createStrings, format, FALLBACK_LANGUAGE, availableLanguage, stringsFor } from './index';

const ARGUMENT = /\{\d+\}/g;

describe('core/i18n', () => {
  it('the two tables are flat, made of text, and have the same keys', () => {
    for (const table of [ptBR, xTest]) {
      for (const value of Object.values(table)) expect(typeof value).toBe('string');
    }
    expect(Object.keys(xTest).sort()).toEqual(Object.keys(ptBR).sort());
  });

  it('no key repeats in the file (the repeated one would silently erase the first)', () => {
    for (const file of ['pt-BR.json', 'x-test.json']) {
      const keys = [...readFileSync(join(import.meta.dirname, '..', file), 'utf8').matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
      expect(
        keys.filter((c, i) => keys.indexOf(c) !== i),
        file,
      ).toEqual([]);
    }
  });

  it('the keys are ASCII, by area with a dot', () => {
    for (const key of Object.keys(ptBR)) expect(key).toMatch(/^[a-z]+\.[A-Za-z-]+$/);
  });

  it('the test language is x-test:<key> followed by the arguments of the pt-BR text', () => {
    for (const [key, text] of Object.entries(ptBR)) {
      const args = text.match(ARGUMENT) ?? [];
      expect(xTest[key as keyof typeof xTest]).toBe([`x-test:${key}`, ...args].join(' '));
    }
  });

  it('format replaces {n} with argument n and leaves what is missing', () => {
    expect(format('há {0} h {1} min', [2, '5'])).toBe('há 2 h 5 min');
    expect(format('{0} e {1}', ['a'])).toBe('a e {1}');
  });

  it('t uses the table of the language', () => {
    expect(stringsFor('pt-BR').t('duration.hMin', 2, 5)).toBe('há 2 h 5 min');
    expect(createStrings('x-test', xTest).t('duration.hMin', 2, 5)).toBe('x-test:duration.hMin 2 5');
  });

  it('the host language finds the table ignoring case and by base language; anything else falls back to English', () => {
    expect(FALLBACK_LANGUAGE).toBe('en');
    expect(availableLanguage('pt-br')).toBe('pt-BR');
    expect(availableLanguage('pt')).toBe('pt-BR');
    expect(availableLanguage('pt-PT')).toBe('pt-BR');
    expect(availableLanguage('de')).toBe('en');
    expect(availableLanguage(undefined)).toBe('en');
    expect(stringsFor('fr').language).toBe('en');
  });

  it('with the interface in German, the strings are the English ones', () => {
    expect(stringsFor('de').t('duration.hMin', 2, 5)).toBe('2 h 5 min ago');
    expect(stringsFor().t('duration.hMin', 2, 5)).toBe('2 h 5 min ago');
  });

  it('English has the same keys as pt-BR and the same {n} in each text', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort());
    for (const [key, text] of Object.entries(ptBR)) {
      const ofEn = en[key as keyof typeof en];
      expect(typeof ofEn, key).toBe('string');
      expect([...(ofEn.match(ARGUMENT) ?? [])].sort(), key).toEqual([...(text.match(ARGUMENT) ?? [])].sort());
    }
  });

  it('no key repeats in en.json', () => {
    const keys = [...readFileSync(join(import.meta.dirname, '..', 'en.json'), 'utf8').matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]);
    expect(keys.filter((c, i) => keys.indexOf(c) !== i)).toEqual([]);
  });

  it('English only repeats the pt-BR text where both languages write it the same (explicit list)', () => {
    const SAME = [
      'document.title',
      'ideas.plan',
      'filter.tier',
      'log.updated',
      'status.durationDH',
      'status.durationHMin',
      'status.durationMin',
      'notice.brand',
      'reader.exception',
      'environment.shellPosix',
      'environment.pluginOk',
      'map.taskColumn',
      'panel.progress',
      'tree.task',
      'tree.group',
      'panel.nTasks',
      'detail.tier',
      'detail.repos',
      'duration.shortMin',
      'duration.shortH',
      'duration.shortHMin',
      'duration.shortD',
      'duration.shortDH',
    ];
    const same = Object.keys(ptBR).filter((c) => en[c as keyof typeof en] === ptBR[c as keyof typeof ptBR]);
    expect(same.filter((c) => !SAME.includes(c))).toEqual([]);
  });

  it('English does not use the Portuguese angle quotes', () => {
    expect(Object.entries(en).filter(([, text]) => /[«»]/.test(text))).toEqual([]);
  });

  it('the channel. area is internal codes: in en the text is the code itself, and pt-BR gives each one a Portuguese code', () => {
    const channel = Object.entries(ptBR).filter(([key]) => key.startsWith('channel.'));
    expect(channel.length).toBeGreaterThan(0);
    for (const [key, text] of channel) {
      expect(en[key as keyof typeof en], key).toBe(key.slice('channel.'.length));
      expect(text, key).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('en and en-US give the en language; fr and pt stay as they were', () => {
    expect(stringsFor('en').language).toBe('en');
    expect(stringsFor('en-US').language).toBe('en');
    expect(availableLanguage('EN-gb')).toBe('en');
    expect(stringsFor('en').t('duration.hMin', 2, 5)).toBe('2 h 5 min ago');
  });

  it('the test language does not enter the runtime: only the tests build it', () => {
    expect(availableLanguage('x-test')).toBe('en');
  });
});
