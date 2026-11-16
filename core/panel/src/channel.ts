// The channel between the page and its host. Apart from `page.ts` so the controller, which the page builds, can
// use it without importing the page back.
import type { WebviewMessage } from './messages';
import type { Saved } from './saved';

export interface HostChannel {
  send(message: WebviewMessage): void;
  /** Calls `handle` with each message the host sends, still to be validated; may give back what stops listening. */
  onReceive(handle: (message: unknown) => void): (() => void) | undefined;
  /** What was saved, from any version of the page, or nothing; the page reads it with `readSaved`. */
  readSaved(): unknown;
  save(status: Saved): void;
}
