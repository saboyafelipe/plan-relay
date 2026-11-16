// core/i18n: the displayed strings, one flat JSON per language. TypeScript imports the JSON
// (the bundler embeds it); the build and the sh scripts read the same file with jq. No host API.
import ptBR from '../pt-BR.json';
import en from '../en.json';

/** The string keys: those of pt-BR, the first language. */
export type Key = keyof typeof ptBR;
export type Table = Record<Key, string>;

export interface Strings {
  /** The language of the table (BCP 47), for the `lang` of the document. */
  language: string;
  /** The text of the key with `{0}`, `{1}`… replaced by the arguments. */
  t: (key: Key, ...args: (string | number)[]) => string;
}

export const FALLBACK_LANGUAGE = 'en';

/** The runtime languages. The test language (`x-test.json`) is left out: only the tests build it. */
const TABLES = { 'pt-BR': ptBR, en } satisfies Record<string, Table> & Record<typeof FALLBACK_LANGUAGE, Table>;

/** A language with a table: a key of `TABLES`. */
export type Language = keyof typeof TABLES;

function isLanguage(name: string): name is Language {
  return Object.hasOwn(TABLES, name);
}

// Computed on use, not at load: a call at the top of the module would keep the tables in every bundle that
// imports this package, even one that never shows a string.
function languages(): Language[] {
  return Object.keys(TABLES).filter(isLanguage);
}

export function format(text: string, args: readonly (string | number)[]): string {
  return text.replace(/\{(\d+)\}/g, (marker, n: string) => (Number(n) < args.length ? String(args[Number(n)]) : marker));
}

export function createStrings(language: string, table: Table): Strings {
  return { language, t: (key, ...args) => format(table[key], args) };
}

/**
 * The available language for the one the host asks for (`vscode.env.language`, `pt-br`…): the same ignoring case,
 * else the same base language, else English (the contract rule for a plan's `language` too).
 */
export function availableLanguage(requested: string | undefined): Language {
  if (!requested) return FALLBACK_LANGUAGE;
  const available = languages();
  const same = available.find((l) => l.toLowerCase() === requested.toLowerCase());
  if (same) return same;
  const base = requested.toLowerCase().split('-')[0];
  return available.find((l) => l.toLowerCase().split('-')[0] === base) ?? FALLBACK_LANGUAGE;
}

export function stringsFor(language?: string): Strings {
  const chosen = availableLanguage(language);
  return createStrings(chosen, TABLES[chosen]);
}
