// The events as temporary alerts: each type has its own `planRelay.notifications.*` setting and the alert
// goes away on its own after `durationSeconds`. The VS Code API comes in as a parameter, so it can be tested without it.
import type * as vscode from 'vscode';
import type { Strings } from '@plan-relay/i18n';
import type { NotifyEvent, EventType } from './events';
import { soundLevel, playsOnEvent } from './sound';

/** The default of each `planRelay.notifications.<type>` setting, used when it has no value; the manifest declares the same (test). */
export const DEFAULTS: Record<EventType, boolean> = {
  taskStarted: true,
  taskCompleted: true,
  runOpened: false,
  runClosed: true,
  handoff: true,
  taskWaitingOnOwner: true,
  taskCancelled: true,
  taskAbandoned: true,
};
export const DEFAULT_SECONDS = 6;
export const MIN_SECONDS = 2;

export interface AlertSettings {
  /** Reads `planRelay.notifications.<key>`; returns the default when the setting has no value. */
  get<T>(key: string, fallback: T): T;
}

export interface Alerter {
  /** Shows the alert and removes it on its own after the seconds. */
  temporary(title: string, seconds: number): void;
  /** Shows the alert prominently (non-modal), staying until the person dismisses it; clicking the button calls `onClick`. */
  requested(title: string, button: string, onClick: () => void): void;
}

/** The slice of `vscode.window` that the alert that needs you uses. */
export type AlertWindow = Pick<typeof vscode.window, 'showErrorMessage'>;

/**
 * The host's alerter. The temporary one is the function the host passes (a progress notification that goes away on
 * its own). The one that needs you goes out through `showErrorMessage`, non-modal: VS Code only keeps a notification
 * on screen (sticky) when it has a button and error severity; warnings and info with a button go to the
 * notification center after a few seconds. If VS Code rejects it, the error goes to `onError`.
 */
export function createAlerter(window: AlertWindow, temporary: Alerter['temporary'], onError: (error: unknown) => void): Alerter {
  return {
    temporary,
    requested(title, button, onClick) {
      void Promise.resolve(window.showErrorMessage(title, button)).then((choice) => {
        if (choice === button) onClick();
      }, onError);
    },
  };
}

/** What the buttons of the alerts that need you do; the host wires each one to the action the panel already has. */
export interface AlertActions {
  /** "Continue the run": opens the session with the plan's `/plan-relay:run`, like the panel's "Run plan". */
  continueRun(folder: string): void;
  /** "Open task": opens the task's file. */
  openTask(folder: string, id: string): void;
  /** "Open panel": reveals the panel (the alert that groups several tasks). */
  openPanel(): void;
}

/** The effective duration: a finite number, never less than the minimum. */
export function secondsOf(config: AlertSettings): number {
  const n = config.get<unknown>('durationSeconds', DEFAULT_SECONDS);
  return typeof n === 'number' && Number.isFinite(n) ? Math.max(MIN_SECONDS, n) : DEFAULT_SECONDS;
}

export function typeEnabled(type: EventType, config: AlertSettings): boolean {
  return config.get<unknown>(type, DEFAULTS[type]) === true;
}

/** The button text of an alert that needs you; `undefined` for the temporary ones. */
export function alertButton(e: NotifyEvent, { t }: Strings): string | undefined {
  if (e.type === 'handoff') return t('notify.continueButton');
  if (e.type === 'taskWaitingOnOwner') return t('tasks' in e ? 'notify.panelButton' : 'notify.taskButton');
  return undefined;
}

/** The alert title: the task's ID and title, or the run's plan; the aggregate says how many and which. */
export function alertText(e: NotifyEvent, { t }: Strings): string {
  if (e.type === 'handoff') return t('notify.handoff', e.plan);
  if (e.type === 'taskWaitingOnOwner') {
    if ('tasks' in e) return t('notify.manyWaitForYou', e.plan, e.tasks.length, e.tasks.map((x) => x.id).join(', '));
    return t('notify.waitsForYou', e.id, e.action ?? '');
  }
  if ('log' in e) return t(e.type === 'runOpened' ? 'notify.runOpened' : 'notify.runClosed', e.plan);
  if ('tasks' in e) {
    const key = {
      taskStarted: 'notify.manyStarted',
      taskCompleted: 'notify.manyFinished',
      taskCancelled: 'notify.manyCancelled',
      taskAbandoned: 'notify.manyAbandoned',
    } as const;
    return t(key[e.type], e.plan, e.tasks.length, e.tasks.map((x) => x.id).join(', '));
  }
  if (e.type === 'taskCancelled') {
    return e.replacement ? t('notify.cancelledReplaced', e.id, e.replacement) : t('notify.cancelled', e.id, e.title);
  }
  if (e.type === 'taskAbandoned') {
    // The cascade is one decision, not six events: "<ID> abandoned, with 5 more tasks".
    const together = e.together ?? 0;
    if (together === 0) return t('notify.abandoned', e.id, e.title);
    return together === 1 ? t('notify.abandonedWithOneMore', e.id) : t('notify.abandonedWithMore', e.id, together);
  }
  return t(e.type === 'taskStarted' ? 'notify.started' : 'notify.finished', e.id, e.title);
}

/**
 * Alerts the events whose type is enabled. The settings are read on every call, so changing one applies on the
 * next event, without reloading the window. With `planRelay.notifications.sound` on for any alert that went out,
 * calls `play` once only (a burst does not become a queue of sounds). Returns how many alerts went out.
 */
export function alertEvents(
  events: NotifyEvent[],
  config: AlertSettings,
  strings: Strings,
  alerter: Alerter,
  actions: AlertActions,
  play: () => void = () => undefined,
): number {
  const seconds = secondsOf(config);
  const tier = soundLevel(config);
  let n = 0;
  let withSound = false;
  for (const e of events) {
    if (!typeEnabled(e.type, config)) continue;
    const title = alertText(e, strings);
    const button = alertButton(e, strings);
    if (button === undefined) alerter.temporary(title, seconds);
    else alerter.requested(title, button, () => onClick(e, actions));
    n += 1;
    if (playsOnEvent(e.type, tier)) withSound = true;
  }
  if (withSound) play();
  return n;
}

function onClick(e: NotifyEvent, actions: AlertActions): void {
  if (e.type === 'handoff') actions.continueRun(e.folder);
  else if (e.type === 'taskWaitingOnOwner') {
    if ('tasks' in e) actions.openPanel();
    else actions.openTask(e.folder, e.id);
  }
}
