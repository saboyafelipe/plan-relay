import { describe, expect, it } from 'vitest';
import { createStrings } from '@plan-relay/i18n';
import xTest from '@plan-relay/i18n/x-test.json';
import ptBR from '@plan-relay/i18n/pt-BR.json';
import {
  DEFAULTS,
  DEFAULT_SECONDS,
  MIN_SECONDS,
  alertEvents,
  alertButton,
  createAlerter,
  secondsOf,
  alertText,
  type AlertActions,
  type AlertSettings,
  type AlertWindow,
} from './alert';
import type { NotifyEvent } from './events';
import manifest from '../../package.json';

const strings = createStrings('x-test', xTest);
const base = { plan: 'p', folder: '/home/dev/projeto/agent_plans/p' };

function config(values: Record<string, unknown> = {}): AlertSettings {
  return { get: <T>(key: string, fallback: T) => (key in values ? (values[key] as T) : fallback) };
}

function alerter() {
  const seen: { title: string; seconds: number }[] = [];
  const requests: { title: string; button: string; click: () => void }[] = [];
  return {
    seen,
    requests,
    temporary: (title: string, seconds: number) => void seen.push({ title, seconds }),
    requested: (title: string, button: string, click: () => void) => void requests.push({ title, button, click }),
  };
}

function actions() {
  const doneOnes: string[] = [];
  const a: AlertActions = {
    continueRun: (folder) => void doneOnes.push(`conduzir ${folder}`),
    openTask: (folder, id) => void doneOnes.push(`task ${folder} ${id}`),
    openPanel: () => void doneOnes.push('panel'),
  };
  return { doneOnes, ...a };
}

const one = (type: 'taskStarted' | 'taskCompleted'): NotifyEvent => ({ ...base, type, id: 'F1-03', title: 'Título' });
const currentRun = (type: 'runOpened' | 'runClosed'): NotifyEvent => ({ ...base, type, log: 'run.log' });
const all: NotifyEvent[] = [one('taskStarted'), one('taskCompleted'), currentRun('runOpened'), currentRun('runClosed')];

describe('alertEvents', () => {
  it('with the defaults alerts started, finished and closed, and not the run opening', () => {
    const a = alerter();
    expect(alertEvents(all, config(), strings, a, actions())).toBe(3);
    expect(a.seen.map((v) => v.title)).toEqual([alertText(all[0]!, strings), alertText(all[1]!, strings), alertText(all[3]!, strings)]);
  });

  it('each type only alerts with its own setting true, and turning one off does not silence the others', () => {
    for (const type of ['taskStarted', 'taskCompleted', 'runOpened', 'runClosed'] as const) {
      const only = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, k === type]));
      const a = alerter();
      alertEvents(all, config(only), strings, a, actions());
      expect(a.seen).toHaveLength(1);
      expect(a.seen[0]!.title).toBe(
        alertText(
          all.find((e) => e.type === type)!,
          strings,
        ),
      );
      const fewer = Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, k !== type]));
      const b = alerter();
      alertEvents(all, config(fewer), strings, b, actions());
      expect(b.seen).toHaveLength(3);
    }
  });

  it('only `true` turns it on: a non-boolean value does not alert', () => {
    const a = alerter();
    expect(alertEvents(all, config({ taskStarted: 'sim', taskCompleted: 1, runClosed: false }), strings, a, actions())).toBe(0);
  });

  it('the settings are read on every call: changing one applies on the next event', () => {
    const values: Record<string, unknown> = { taskStarted: false };
    const c = config(values);
    const a = alerter();
    alertEvents([one('taskStarted')], c, strings, a, actions());
    values.taskStarted = true;
    alertEvents([one('taskStarted')], c, strings, a, actions());
    expect(a.seen).toHaveLength(1);
  });

  it(`the aggregated event follows its type's setting`, () => {
    const aggregated: NotifyEvent = {
      ...base,
      type: 'taskCompleted',
      tasks: [
        { id: 'A', title: 'a' },
        { id: 'B', title: 'b' },
      ],
    };
    const a = alerter();
    alertEvents([aggregated], config({ taskCompleted: false }), strings, a, actions());
    expect(a.seen).toHaveLength(0);
    alertEvents([aggregated], config(), strings, a, actions());
    expect(a.seen).toHaveLength(1);
    expect(a.seen[0]!.title).toBe('x-test:notify.manyFinished p 2 A, B');
  });

  it('the ones that need you stay (requested, not temporary) and each only with its own setting', () => {
    const waitingOn: NotifyEvent = { ...base, type: 'taskWaitingOnOwner', id: 'F1-03', title: 'T', action: 'decidir X' };
    const handoffEvent: NotifyEvent = { ...base, type: 'handoff', log: 'run.log', handoff: '2026-11-14 18:47' };
    const a = alerter();
    expect(alertEvents([waitingOn, handoffEvent], config(), strings, a, actions())).toBe(2);
    expect(a.seen).toEqual([]);
    expect(a.requests.map((p) => p.title)).toEqual(['x-test:notify.waitsForYou F1-03 decidir X', 'x-test:notify.handoff p']);
    expect(a.requests.map((p) => p.button)).toEqual(['x-test:notify.taskButton', 'x-test:notify.continueButton']);
    const b = alerter();
    alertEvents([waitingOn, handoffEvent], config({ handoff: false }), strings, b, actions());
    expect(b.requests.map((p) => p.button)).toEqual(['x-test:notify.taskButton']);
    const c = alerter();
    alertEvents([waitingOn, handoffEvent], config({ taskWaitingOnOwner: false }), strings, c, actions());
    expect(c.requests.map((p) => p.button)).toEqual(['x-test:notify.continueButton']);
    const d = alerter();
    expect(alertEvents([waitingOn, handoffEvent], config({ handoff: false, taskWaitingOnOwner: false }), strings, d, actions())).toBe(0);
  });

  it('the handoff button calls the opener with the plan folder; the wait one opens the task', () => {
    const a = alerter();
    const x = actions();
    alertEvents(
      [
        { ...base, type: 'handoff', log: 'run.log', handoff: 'h' },
        { ...base, type: 'taskWaitingOnOwner', id: 'F1-03', title: 'T', action: 'x' },
      ],
      config(),
      strings,
      a,
      x,
    );
    for (const p of a.requests) p.click();
    expect(x.doneOnes).toEqual([`conduzir ${base.folder}`, `task ${base.folder} F1-03`]);
  });

  it('several tasks waiting on the owner become a single alert, with "Open panel"', () => {
    const aggregated: NotifyEvent = {
      ...base,
      type: 'taskWaitingOnOwner',
      tasks: [
        { id: 'A', title: 'a' },
        { id: 'B', title: 'b' },
      ],
    };
    const a = alerter();
    const x = actions();
    alertEvents([aggregated], config(), strings, a, x);
    expect(a.requests).toHaveLength(1);
    expect(a.requests[0]!.title).toBe('x-test:notify.manyWaitForYou p 2 A, B');
    expect(alertButton(aggregated, strings)).toBe('x-test:notify.panelButton');
    a.requests[0]!.click();
    expect(x.doneOnes).toEqual(['panel']);
  });

  describe('sound', () => {
    const waitingOn: NotifyEvent = { ...base, type: 'taskWaitingOnOwner', id: 'F1-03', title: 'T', action: 'x' };
    const handoffEvent: NotifyEvent = { ...base, type: 'handoff', log: 'run.log', handoff: 'h' };

    function played(events: NotifyEvent[], values: Record<string, unknown>): number {
      let n = 0;
      alertEvents(events, config(values), strings, alerter(), actions(), () => (n += 1));
      return n;
    }

    it('off (the default) does not play', () => {
      expect(played([handoffEvent, waitingOn, ...all], {})).toBe(0);
      expect(played([handoffEvent], { sound: 'off' })).toBe(0);
    });

    it('attention only plays on handoff and wait on owner', () => {
      expect(played([handoffEvent], { sound: 'attention' })).toBe(1);
      expect(played([waitingOn], { sound: 'attention' })).toBe(1);
      expect(played(all, { sound: 'attention', runOpened: true })).toBe(0);
    });

    it('all plays on the temporary ones too', () => {
      expect(played([one('taskStarted')], { sound: 'all' })).toBe(1);
    });

    it('a disabled alert does not play', () => {
      expect(played([handoffEvent], { sound: 'all', handoff: false })).toBe(0);
      expect(played([currentRun('runOpened')], { sound: 'all' })).toBe(0);
    });

    it('a load with several alerts plays only once', () => {
      expect(played([handoffEvent, waitingOn, ...all], { sound: 'all' })).toBe(1);
    });
  });

  it('passes the configured duration, with a minimum of 2 and a default of 6', () => {
    const a = alerter();
    alertEvents([one('taskStarted')], config({ durationSeconds: 10 }), strings, a, actions());
    alertEvents([one('taskStarted')], config({ durationSeconds: 0 }), strings, a, actions());
    alertEvents([one('taskStarted')], config(), strings, a, actions());
    expect(a.seen.map((v) => v.seconds)).toEqual([10, 2, 6]);
    expect(secondsOf(config({ durationSeconds: 'x' }))).toBe(6);
  });
});

describe('createAlerter', () => {
  const fail = (e: unknown): never => {
    throw e;
  };
  // VS Code only keeps a notification on screen (sticky) when it has a button and error severity; warnings and info
  // with a button go to the notification center on their own after a few seconds. That is why the alert that needs you goes out through `showErrorMessage`.
  function window(answer: string | undefined) {
    const calls: string[] = [];
    const show =
      (tier: string) =>
      (title: string, ...buttons: unknown[]) => {
        calls.push(`${tier} ${title} [${buttons.join(', ')}]`);
        return Promise.resolve(answer);
      };
    const j = {
      showErrorMessage: show('error'),
      showWarningMessage: show('aviso'),
      showInformationMessage: show('info'),
    } as unknown as AlertWindow;
    return { calls, j };
  }

  it('the request goes out with error severity, the only one that stays until dismissed, non-modal and with the button', async () => {
    const { calls, j } = window(undefined);
    createAlerter(j, () => undefined, fail).requested('A condução de p passou o bastão', 'Continuar', () => undefined);
    await Promise.resolve();
    expect(calls).toEqual(['error A condução de p passou o bastão [Continuar]']);
  });

  it('clicking the button calls the action; dismissing without clicking does not', async () => {
    let n = 0;
    createAlerter(window('Abrir task').j, () => undefined, fail).requested('t', 'Abrir task', () => (n += 1));
    createAlerter(window(undefined).j, () => undefined, fail).requested('t', 'Abrir task', () => (n += 10));
    await new Promise((r) => setTimeout(r, 0));
    expect(n).toBe(1);
  });

  it('a request that VS Code rejects goes to the error handler, not to an unhandled rejection', async () => {
    const errors: unknown[] = [];
    const j = { showErrorMessage: () => Promise.reject(new Error('gone')) } as unknown as AlertWindow;
    let clicked = false;
    createAlerter(
      j,
      () => undefined,
      (e) => errors.push(e),
    ).requested('t', 'Abrir task', () => (clicked = true));
    await new Promise((r) => setTimeout(r, 0));
    expect(errors.map((e) => (e as Error).message)).toEqual(['gone']);
    expect(clicked).toBe(false);
  });

  it(`the temporary one goes to the host's function, with the seconds`, () => {
    const seen: string[] = [];
    createAlerter(window(undefined).j, (t, s) => void seen.push(`${t} ${s}`), fail).temporary('F1-03 começou', 6);
    expect(seen).toEqual(['F1-03 começou 6']);
  });
});

describe('alertText', () => {
  it(`comes from i18n with the task's ID and title, or the run's plan`, () => {
    expect(alertText(one('taskStarted'), strings)).toBe('x-test:notify.started F1-03 Título');
    expect(alertText(one('taskCompleted'), strings)).toBe('x-test:notify.finished F1-03 Título');
    expect(alertText(currentRun('runOpened'), strings)).toBe('x-test:notify.runOpened p');
    expect(alertText(currentRun('runClosed'), strings)).toBe('x-test:notify.runClosed p');
  });

  it('in pt-BR uses the specified phrases', () => {
    const pt = createStrings('pt-BR', ptBR);
    expect(alertText(one('taskStarted'), pt)).toBe('F1-03 começou: Título');
    expect(alertText(currentRun('runClosed'), pt)).toBe('Corrida encerrada em p');
    expect(alertText({ ...base, type: 'handoff', log: 'l', handoff: 'h' }, pt)).toBe('A condução de p passou o bastão');
    expect(alertText({ ...base, type: 'taskWaitingOnOwner', id: 'F1-03', title: 'T', action: 'decidir X' }, pt)).toBe(
      'F1-03 precisa de você: decidir X',
    );
  });

  it('x-test has the keys', () => {
    expect(Object.keys(xTest)).toContain('notify.started');
  });
});

describe('manifest', () => {
  it('declares one boolean setting per event type, with the default the code falls back to', () => {
    const p = manifest.contributes.configuration.properties as Record<string, { type?: string; default: unknown; minimum?: number }>;
    const prefix = 'planRelay.notifications.';
    const declared = Object.keys(p)
      .filter((k) => k.startsWith(prefix) && p[k]?.type === 'boolean')
      .map((k) => k.slice(prefix.length));
    expect(declared.sort()).toEqual(Object.keys(DEFAULTS).sort());
    for (const [t, value] of Object.entries(DEFAULTS)) expect(p[`${prefix}${t}`]?.default, t).toBe(value);
    expect(p[`${prefix}durationSeconds`]).toMatchObject({ default: DEFAULT_SECONDS, minimum: MIN_SECONDS });
  });
});

describe('cancel and give up', () => {
  const cancelled: NotifyEvent = { ...base, type: 'taskCancelled', id: 'F4-07', title: 'Provar no Windows' };
  const replacedTask: NotifyEvent = { ...cancelled, replacement: 'F17-04' };
  const abandoned = (together: number): NotifyEvent => ({ ...base, type: 'taskAbandoned', id: 'F17-02', title: 'Leitor', together });

  it('both settings default to on and the alerts are temporary', () => {
    expect(DEFAULTS.taskCancelled).toBe(true);
    expect(DEFAULTS.taskAbandoned).toBe(true);
    const a = alerter();
    expect(alertEvents([cancelled, abandoned(5)], config(), strings, a, actions())).toBe(2);
    expect(a.requests).toEqual([]);
    expect(a.seen.map((v) => v.title)).toEqual([
      'x-test:notify.cancelled F4-07 Provar no Windows',
      'x-test:notify.abandonedWithMore F17-02 5',
    ]);
    expect(alertButton(cancelled, strings)).toBeUndefined();
  });

  it('each only with its own setting', () => {
    const a = alerter();
    alertEvents([cancelled, abandoned(5)], config({ taskCancelled: false }), strings, a, actions());
    expect(a.seen.map((v) => v.title)).toEqual(['x-test:notify.abandonedWithMore F17-02 5']);
    const b = alerter();
    alertEvents([cancelled, abandoned(5)], config({ taskAbandoned: false }), strings, b, actions());
    expect(b.seen.map((v) => v.title)).toEqual(['x-test:notify.cancelled F4-07 Provar no Windows']);
  });

  it('sound only at the all level', () => {
    let n = 0;
    alertEvents([cancelled, abandoned(1)], config({ sound: 'attention' }), strings, alerter(), actions(), () => (n += 1));
    expect(n).toBe(0);
    alertEvents([cancelled], config({ sound: 'all' }), strings, alerter(), actions(), () => (n += 1));
    expect(n).toBe(1);
  });

  it('in pt-BR uses the specified phrases', () => {
    const pt = createStrings('pt-BR', ptBR);
    expect(alertText(replacedTask, pt)).toBe('F4-07 cancelada → substituída por F17-04');
    expect(alertText(cancelled, pt)).toBe('F4-07 cancelada: Provar no Windows');
    expect(alertText(abandoned(5), pt)).toBe('F17-02 abandonada, com mais 5 tasks');
    expect(alertText(abandoned(1), pt)).toBe('F17-02 abandonada, com mais 1 task');
    expect(alertText(abandoned(0), pt)).toBe('F17-02 abandonada: Leitor');
  });

  it('the aggregates say how many and which', () => {
    const tasks = [
      { id: 'A', title: 'a' },
      { id: 'B', title: 'b' },
    ];
    expect(alertText({ ...base, type: 'taskCancelled', tasks }, strings)).toBe('x-test:notify.manyCancelled p 2 A, B');
    expect(alertText({ ...base, type: 'taskAbandoned', tasks }, strings)).toBe('x-test:notify.manyAbandoned p 2 A, B');
  });
});
