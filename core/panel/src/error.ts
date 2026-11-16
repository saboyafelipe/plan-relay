// The text of a reading error: the reader gives the code and the arguments, the translation is done here.
import { stringsFor, type Key, type Strings } from '@plan-relay/i18n';
import type { ErrorInput } from './input';

/** The error text in the language of `strings` (English without them); the cause goes in as the last argument. */
export function errorText(error: ErrorInput, strings: Strings = stringsFor()): string {
  const args = error.cause ? [...error.args, errorText(error.cause, strings)] : error.args;
  const key: Key = `reader.${error.code}`;
  return strings.t(key, ...args);
}
