/** Why the panel is reloading the plans; it shows up in the output channel. */
export type RefreshReason = 'activation' | 'file' | 'interval' | 'command' | 'button' | 'ready';

/**
 * Whether a load also re-reads the plugin state (through the agent provider, 1–3 s). Loads triggered by plan files
 * number in the dozens during a map or a run and do not change the plugin; it is re-read on the others
 * and when `marked` (an agent setting changed, or the workspace folders) since the last load.
 */
export function readPluginOnLoad(reason: RefreshReason, marked: boolean): boolean {
  return reason !== 'file' || marked;
}

/** The schedule's clock; the tests use vitest's fake one. */
export interface Clock {
  now(): number;
  after(ms: number, fn: () => void): unknown;
  cancel(mark: unknown): void;
}

const REAL_CLOCK: Clock = {
  now: () => Date.now(),
  after: (ms, fn) => setTimeout(fn, ms),
  cancel: (mark) => clearTimeout(mark as ReturnType<typeof setTimeout>),
};

export const DEBOUNCE_MS = 500;
const MINUTE_MS = 60_000;

export interface ScheduleOptions {
  /** Loads the plans. The schedule never calls it twice at the same time. */
  load: (reason: RefreshReason) => Promise<void>;
  /** Minutes between automatic loads; 0 (or an invalid value) turns it off. */
  intervalMinutes: number;
  /** Whether the view starts visible. While hidden, the timer does not fire and requests wait. */
  visible: boolean;
  debounceMs?: number;
  clock?: Clock;
}

function intervalInMs(minutes: number): number {
  return Number.isFinite(minutes) && minutes > 0 ? minutes * MINUTE_MS : 0;
}

/**
 * Decides when the panel reloads the plans: debounced requests, one load at a time
 * (a request during a load runs once at the end), a timer of N minutes since the
 * last load, and nothing while the view is hidden.
 */
export class Schedule {
  private readonly load: (reason: RefreshReason) => Promise<void>;
  private readonly clock: Clock;
  private readonly debounceMs: number;
  private intervalMs: number;
  private isVisible: boolean;
  private reference: number;
  private debounceMark: unknown;
  private debounceReason: RefreshReason | undefined;
  private timerMark: unknown;
  private loading = false;
  /** Request that arrived during a load. */
  private pending: RefreshReason | undefined;
  /** Request that arrived while the view was hidden. */
  private deferred: RefreshReason | undefined;
  private finishedTask = false;

  constructor(options: ScheduleOptions) {
    this.load = options.load;
    this.clock = options.clock ?? REAL_CLOCK;
    this.debounceMs = options.debounceMs ?? DEBOUNCE_MS;
    this.intervalMs = intervalInMs(options.intervalMinutes);
    this.isVisible = options.visible;
    this.reference = this.clock.now();
    this.scheduleTimer();
  }

  /** Requests a load. With the view hidden it waits for the view to return, unless `evenHidden`. */
  request(reason: RefreshReason, options: { evenHidden?: boolean } = {}): void {
    if (this.finishedTask) return;
    if (!this.isVisible && !options.evenHidden) {
      this.deferred = reason;
      return;
    }
    this.debounceReason = reason;
    if (this.debounceMark !== undefined) this.clock.cancel(this.debounceMark);
    this.debounceMark = this.clock.after(this.debounceMs, () => {
      this.debounceMark = undefined;
      const m = this.debounceReason ?? reason;
      this.debounceReason = undefined;
      this.runCommand(m);
    });
  }

  /** The view became visible or hidden. On returning, it loads if there were requests or the interval has passed. */
  visible(visible: boolean): void {
    if (this.finishedTask || visible === this.isVisible) return;
    this.isVisible = visible;
    if (!visible) {
      this.cancelTimer();
      return;
    }
    if (this.deferred) {
      const m = this.deferred;
      this.deferred = undefined;
      this.request(m);
    } else if (this.intervalMs > 0 && this.clock.now() - this.reference >= this.intervalMs) {
      this.request('interval');
    } else {
      this.scheduleTimer();
    }
  }

  /** Changes the interval; the next automatic load is N minutes from now. */
  setInterval(minutes: number): void {
    if (this.finishedTask) return;
    this.intervalMs = intervalInMs(minutes);
    this.reference = this.clock.now();
    this.scheduleTimer();
  }

  dispose(): void {
    this.finishedTask = true;
    if (this.debounceMark !== undefined) this.clock.cancel(this.debounceMark);
    this.debounceMark = undefined;
    this.cancelTimer();
  }

  private runCommand(reason: RefreshReason): void {
    if (this.finishedTask) return;
    if (this.loading) {
      this.pending = reason;
      return;
    }
    this.loading = true;
    this.cancelTimer();
    Promise.resolve()
      .then(() => this.load(reason))
      .catch(() => undefined)
      .finally(() => {
        this.loading = false;
        this.reference = this.clock.now();
        const pending = this.pending;
        this.pending = undefined;
        if (pending === undefined) {
          this.scheduleTimer();
        } else if (this.isVisible) {
          this.runCommand(pending);
        } else {
          this.deferred = pending;
        }
      });
  }

  private scheduleTimer(): void {
    this.cancelTimer();
    if (this.finishedTask || !this.isVisible || this.loading || this.intervalMs <= 0) return;
    const rest = Math.max(0, this.reference + this.intervalMs - this.clock.now());
    this.timerMark = this.clock.after(rest, () => {
      this.timerMark = undefined;
      this.runCommand('interval');
    });
  }

  private cancelTimer(): void {
    if (this.timerMark !== undefined) this.clock.cancel(this.timerMark);
    this.timerMark = undefined;
  }
}
