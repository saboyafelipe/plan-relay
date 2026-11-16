// Time elapsed since an instant `YYYY-MM-DDTHH:MMZ` (UTC), as short text.
import { stringsFor, type Strings } from '@plan-relay/i18n';

const FORMAT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})Z$/;

function instant(text: string): number | undefined {
  const m = FORMAT.exec(text);
  if (!m) return undefined;
  // The format guarantees five groups; NaN would fail the round-trip check below.
  const [year = NaN, month = NaN, day = NaN, hour = NaN, minute = NaN] = m.slice(1).map(Number);
  const t = Date.UTC(year, month - 1, day, hour, minute);
  const d = new Date(t);
  const check =
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day &&
    d.getUTCHours() === hour &&
    d.getUTCMinutes() === minute;
  return check ? t : undefined;
}

/** Whole minutes from `started` to `finished` (text `YYYY-MM-DDTHH:MMZ` or an instant); `null` if either is missing or invalid, or if `finished` comes first. */
export function minutesBetween(started: string | null, finished: string | Date | null): number | null {
  if (started === null || finished === null) return null;
  const a = instant(started);
  const b = typeof finished === 'string' ? instant(finished) : finished.getTime();
  if (a === undefined || b === undefined || b < a) return null;
  return Math.floor((b - a) / 60_000);
}

/** «3 min ago», «2 h 5 min ago», «3 d 4 h ago» (in pt-BR the text says «há»); `null` or an invalid date gives «—». */
export function since(started: string | null, now: Date, strings: Strings = stringsFor()): string {
  if (started === null) return '—';
  const t = instant(started);
  if (t === undefined) return '—';
  return minutesText(Math.max(0, Math.floor((now.getTime() - t) / 60_000)), strings);
}

/** Minutes as a duration, without the «há»: «3 min», «2 h 5 min», «3 d 4 h». */
export function shortDuration(minutes: number, strings: Strings = stringsFor()): string {
  if (minutes < 60) return strings.t('duration.shortMin', minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? strings.t('duration.shortHMin', hours, rest) : strings.t('duration.shortH', hours);
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? strings.t('duration.shortDH', days, remainingHours) : strings.t('duration.shortD', days);
}

/** Minutes as short text: «há 3 min», «há 2 h 5 min», «há 3 d 4 h». */
export function minutesText(minutes: number, strings: Strings = stringsFor()): string {
  if (minutes < 60) return strings.t('duration.min', minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const rest = minutes % 60;
    return rest ? strings.t('duration.hMin', hours, rest) : strings.t('duration.h', hours);
  }
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? strings.t('duration.dH', days, remainingHours) : strings.t('duration.d', days);
}
