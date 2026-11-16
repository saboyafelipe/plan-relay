import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createStrings } from '@plan-relay/i18n';
import xTest from '@plan-relay/i18n/x-test.json';
import { chooseWindowGate, gateIsOn, readWindowGate, writeWindowGate, type GateDeps } from './window-gate';

const strings = createStrings('x-test', xTest);

let folder: string;
const settings = () => join(folder, '.claude', 'settings.local.json');
const read = async () => readFile(settings(), 'utf8');
const put = async (text: string) => {
  await mkdir(join(folder, '.claude'), { recursive: true });
  await writeFile(settings(), text, 'utf8');
};

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'prwg-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

describe('gateIsOn', () => {
  it('accepts the same true values as window.sh, and nothing else', () => {
    for (const v of ['on', 'ON', 'On', '1', 'true', 'TRUE', 'True', 'yes', 'YES', 'Yes']) expect(gateIsOn(v), v).toBe(true);
    for (const v of [undefined, '', 'off', '0', 'false', 'no', 'oN', ' on', 'enabled', 1, true, null])
      expect(gateIsOn(v), String(v)).toBe(false);
  });
});

describe('readWindowGate', () => {
  it('a missing file is off', async () => {
    expect(await readWindowGate(folder, strings)).toEqual({ on: false });
  });

  it('reads the current value of env.PLAN_RELAY_WINDOW', async () => {
    await put('{"env":{"PLAN_RELAY_WINDOW":"yes"}}');
    expect(await readWindowGate(folder, strings)).toEqual({ on: true });
    await put('{"env":{"PLAN_RELAY_WINDOW":"off"}}');
    expect(await readWindowGate(folder, strings)).toEqual({ on: false });
    await put('{"permissions":{}}');
    expect(await readWindowGate(folder, strings)).toEqual({ on: false });
  });

  it('invalid JSON is an error with the i18n text', async () => {
    await put('{"env": ');
    expect(await readWindowGate(folder, strings)).toEqual({ error: strings.t('gate.invalid', '.claude/settings.local.json') });
  });
});

describe('writeWindowGate', () => {
  it('a missing file: creates .claude/ and the file with only the key', async () => {
    expect(await writeWindowGate(folder, true, strings)).toEqual({ on: true });
    expect(JSON.parse(await read())).toEqual({ env: { PLAN_RELAY_WINDOW: 'on' } });
    expect(await read()).toBe('{\n  "env": {\n    "PLAN_RELAY_WINDOW": "on"\n  }\n}\n');
  });

  it('turning off with no file creates nothing', async () => {
    expect(await writeWindowGate(folder, false, strings)).toEqual({ on: false });
    await expect(readdir(folder)).resolves.toEqual([]);
  });

  it('an existing file keeps every other key and changes only this one', async () => {
    const before = {
      permissions: { allow: ['Bash(sh *)'], deny: [] },
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'sh x.sh' }] }] },
      env: { PLAN_RELAY_CONTEXT_LIMIT: '500000', PLAN_RELAY_WINDOW: 'off' },
      enabledPlugins: { 'a@b': true },
    };
    await put(JSON.stringify(before));
    expect(await writeWindowGate(folder, true, strings)).toEqual({ on: true });
    const after = JSON.parse(await read()) as typeof before;
    expect(after).toEqual({ ...before, env: { ...before.env, PLAN_RELAY_WINDOW: 'on' } });
    expect(Object.keys(after)).toEqual(Object.keys(before));
  });

  it('turning off removes the key, and env when it becomes empty, without deleting the file', async () => {
    await put('{"permissions":{"allow":[]},"env":{"PLAN_RELAY_WINDOW":"on","OTHER":"1"}}');
    expect(await writeWindowGate(folder, false, strings)).toEqual({ on: false });
    expect(JSON.parse(await read())).toEqual({ permissions: { allow: [] }, env: { OTHER: '1' } });

    await put('{"permissions":{"allow":[]},"env":{"PLAN_RELAY_WINDOW":"on"}}');
    expect(await writeWindowGate(folder, false, strings)).toEqual({ on: false });
    expect(JSON.parse(await read())).toEqual({ permissions: { allow: [] } });

    await put('{"env":{"PLAN_RELAY_WINDOW":"on"}}');
    expect(await writeWindowGate(folder, false, strings)).toEqual({ on: false });
    expect(await read()).toBe('{}\n');
  });

  it('invalid JSON: the file is not touched and the error has the i18n text', async () => {
    await put('{"env": ');
    expect(await writeWindowGate(folder, true, strings)).toEqual({ error: strings.t('gate.invalid', '.claude/settings.local.json') });
    expect(await read()).toBe('{"env": ');
  });

  it('a top level or env that is not an object counts as invalid and is not touched', async () => {
    for (const text of ['[]', '"on"', '{"env":"PLAN_RELAY_WINDOW=on"}', '{"env":[]}']) {
      await put(text);
      expect(await writeWindowGate(folder, true, strings), text).toEqual({
        error: strings.t('gate.invalid', '.claude/settings.local.json'),
      });
      expect(await read()).toBe(text);
    }
  });

  it('refuses a .claude folder or a settings file that is a symbolic link leading outside the folder', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'prwg-out-'));
    try {
      await symlink(outside, join(folder, '.claude'));
      expect(await writeWindowGate(folder, true, strings)).toEqual({ error: strings.t('gate.outside', '.claude/settings.local.json') });
      expect(await readdir(outside)).toEqual([]);
      await rm(join(folder, '.claude'));
      await mkdir(join(folder, '.claude'));
      await writeFile(join(outside, 'settings.json'), '{}', 'utf8');
      await symlink(join(outside, 'settings.json'), settings());
      expect(await writeWindowGate(folder, true, strings)).toEqual({ error: strings.t('gate.outside', '.claude/settings.local.json') });
      expect(await readFile(join(outside, 'settings.json'), 'utf8')).toBe('{}');
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });

  it('accepts a workspace folder reached through a link, and a settings link that stays inside', async () => {
    const link = `${folder}-link`;
    await symlink(folder, link);
    try {
      await mkdir(join(folder, '.claude'));
      await writeFile(join(folder, '.claude', 'real.json'), '{}', 'utf8');
      await symlink(join(folder, '.claude', 'real.json'), settings());
      expect(await writeWindowGate(link, true, strings)).toEqual({ on: true });
    } finally {
      await rm(link);
    }
  });

  it('leaves no temporary file next to the settings', async () => {
    await put('{}');
    await writeWindowGate(folder, true, strings);
    expect(await readdir(join(folder, '.claude'))).toEqual(['settings.local.json']);
  });
});

describe('chooseWindowGate (the panel action)', () => {
  function deps(answer: 'on' | 'off' | undefined, folders: string[] = [folder]) {
    const seen = {
      picks: [] as { placeholder: string; options: { id: string; label: string }[] }[],
      informed: [] as string[],
      warned: [] as string[],
      log: [] as string[],
    };
    const d: GateDeps = {
      folders: () => folders,
      pick: (placeholder, options) => {
        seen.picks.push({ placeholder, options: options.map((o) => ({ id: o.id, label: o.label })) });
        return Promise.resolve(answer);
      },
      inform: (text) => seen.informed.push(text),
      warn: (text) => seen.warned.push(text),
      channel: { info: (l) => seen.log.push(l), warn: (l) => seen.log.push(l) },
      agentName: 'Agent',
      strings,
    };
    return { d, seen };
  }

  it('shows the value read from the file and writes the choice, warning it applies to new sessions', async () => {
    const { d, seen } = deps('on');
    await chooseWindowGate(d);
    expect(seen.picks).toEqual([
      {
        placeholder: strings.t('gate.placeholder', strings.t('gate.off')),
        options: [
          { id: 'on', label: strings.t('gate.on') },
          { id: 'off', label: strings.t('gate.off') },
        ],
      },
    ]);
    expect(JSON.parse(await read())).toEqual({ env: { PLAN_RELAY_WINDOW: 'on' } });
    expect(seen.informed).toEqual([strings.t('gate.savedOn', 'Agent')]);
  });

  it('turns off a gate that is on', async () => {
    await put('{"env":{"PLAN_RELAY_WINDOW":"true"}}');
    const { d, seen } = deps('off');
    await chooseWindowGate(d);
    expect(seen.picks[0]?.placeholder).toBe(strings.t('gate.placeholder', strings.t('gate.on')));
    expect(await read()).toBe('{}\n');
    expect(seen.informed).toEqual([strings.t('gate.savedOff', 'Agent')]);
  });

  it('dismissing the pick, or choosing the current value, writes nothing', async () => {
    const dismissed = deps(undefined);
    await chooseWindowGate(dismissed.d);
    expect(await readdir(folder)).toEqual([]);
    await put('{"env":{"PLAN_RELAY_WINDOW":"On"}}');
    const same = deps('on');
    await chooseWindowGate(same.d);
    expect(await read()).toBe('{"env":{"PLAN_RELAY_WINDOW":"On"}}');
    expect([...dismissed.seen.informed, ...same.seen.informed]).toEqual([]);
  });

  it('an invalid file warns with the i18n text and offers nothing', async () => {
    await put('not json');
    const { d, seen } = deps('on');
    await chooseWindowGate(d);
    expect(seen.picks).toEqual([]);
    expect(seen.warned).toEqual([strings.t('gate.invalid', '.claude/settings.local.json')]);
    expect(await read()).toBe('not json');
  });

  it('without a workspace folder it warns and offers nothing', async () => {
    const { d, seen } = deps('on', []);
    await chooseWindowGate(d);
    expect(seen.picks).toEqual([]);
    expect(seen.warned).toEqual([strings.t('gate.noFolder')]);
  });

  it('a file system failure (here .claude is a file) warns instead of throwing', async () => {
    await writeFile(join(folder, '.claude'), 'x', 'utf8');
    const { d, seen } = deps('on');
    await expect(chooseWindowGate(d)).resolves.toBeUndefined();
    expect(seen.picks).toEqual([]);
    expect(seen.warned).toHaveLength(1);
    expect(seen.warned[0]).toMatch(/^x-test:gate\.failed \.claude\/settings\.local\.json \S/);
  });
});
