import { describe, expect, it } from 'vitest';
import { createStrings } from '@plan-relay/i18n';
import xTest from '@plan-relay/i18n/x-test.json';
import { soundCommands, soundLevel, playsOnEvent, playSound, type RunCommand } from './sound';
import type { EventType } from './events';
import manifest from '../../package.json';

const strings = createStrings('x-test', xTest);

function config(values: Record<string, unknown> = {}) {
  return { get: <T>(key: string, fallback: T) => (key in values ? (values[key] as T) : fallback) };
}

const TYPES: EventType[] = [
  'taskStarted',
  'taskCompleted',
  'runOpened',
  'runClosed',
  'handoff',
  'taskWaitingOnOwner',
  'taskCancelled',
  'taskAbandoned',
];

describe('soundCommands', () => {
  it('macOS: afplay with a fixed path and a system sound', () => {
    expect(soundCommands('darwin')).toEqual([{ command: '/usr/bin/afplay', args: ['/System/Library/Sounds/Glass.aiff'] }]);
  });

  it('Linux: paplay with the freedesktop sound, and canberra-gtk-play if it is missing', () => {
    expect(soundCommands('linux')).toEqual([
      { command: 'paplay', args: ['/usr/share/sounds/freedesktop/stereo/complete.oga'] },
      { command: 'canberra-gtk-play', args: ['-i', 'complete'] },
    ]);
  });

  it('Windows: powershell without a profile playing the system sound', () => {
    expect(soundCommands('win32')).toEqual([
      { command: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', '[System.Media.SystemSounds]::Asterisk.Play()'] },
    ]);
  });

  it('other platform: no command', () => {
    expect(soundCommands('aix')).toEqual([]);
  });
});

describe('soundLevel and playsOnEvent', () => {
  it('the default is off, and so is a value outside the list', () => {
    expect(soundLevel(config())).toBe('off');
    expect(soundLevel(config({ sound: 'alto' }))).toBe('off');
    expect(soundLevel(config({ sound: true }))).toBe('off');
    expect(soundLevel(config({ sound: 'attention' }))).toBe('attention');
    expect(soundLevel(config({ sound: 'all' }))).toBe('all');
  });

  it('off plays on none; attention only on handoff and wait on owner; all on all', () => {
    expect(TYPES.filter((t) => playsOnEvent(t, 'off'))).toEqual([]);
    expect(TYPES.filter((t) => playsOnEvent(t, 'attention'))).toEqual(['handoff', 'taskWaitingOnOwner']);
    expect(TYPES.filter((t) => playsOnEvent(t, 'all'))).toEqual(TYPES);
  });
});

describe('playSound', () => {
  function runCommand(answers: Record<string, 'ok' | 'error' | 'lanca'>) {
    const calls: string[] = [];
    const r: RunCommand = (command, args) => {
      calls.push(`${command} ${args.join(' ')}`);
      const answer = answers[command] ?? 'error';
      if (answer === 'lanca') return Promise.reject(new Error('quebrou'));
      return Promise.resolve(answer === 'ok' ? { stdout: '', stderr: '' } : { error: `${command} não arrancou` });
    };
    return { calls, r };
  }

  it('plays the first command of the platform and logs nothing when it works', async () => {
    const { calls, r } = runCommand({ '/usr/bin/afplay': 'ok' });
    const lines: string[] = [];
    await playSound('darwin', r, (l) => void lines.push(l), strings);
    expect(calls).toEqual(['/usr/bin/afplay /System/Library/Sounds/Glass.aiff']);
    expect(lines).toEqual([]);
  });

  it('on Linux, without paplay, tries canberra-gtk-play', async () => {
    const { calls, r } = runCommand({ 'canberra-gtk-play': 'ok' });
    const lines: string[] = [];
    await playSound('linux', r, (l) => void lines.push(l), strings);
    expect(calls).toEqual(['paplay /usr/share/sounds/freedesktop/stereo/complete.oga', 'canberra-gtk-play -i complete']);
    expect(lines).toEqual([]);
  });

  it('no player: one output channel line with the last error, without throwing', async () => {
    const { r } = runCommand({});
    const lines: string[] = [];
    await expect(playSound('linux', r, (l) => void lines.push(l), strings)).resolves.toBeUndefined();
    expect(lines).toEqual(['x-test:log.soundFailed canberra-gtk-play não arrancou']);
  });

  it('a process that rejects also becomes just one line', async () => {
    const { r } = runCommand({ '/usr/bin/afplay': 'lanca' });
    const lines: string[] = [];
    await expect(playSound('darwin', r, (l) => void lines.push(l), strings)).resolves.toBeUndefined();
    expect(lines).toEqual(['x-test:log.soundFailed quebrou']);
  });

  it('platform without a command: one line, running nothing', async () => {
    const { calls, r } = runCommand({});
    const lines: string[] = [];
    await playSound('aix', r, (l) => void lines.push(l), strings);
    expect(calls).toEqual([]);
    expect(lines).toEqual(['x-test:log.soundNoPlayer aix']);
  });
});

describe('manifest', () => {
  it('declares planRelay.notifications.sound: off | attention | all, default off, with one description per value', () => {
    const p = manifest.contributes.configuration.properties as Record<
      string,
      { default?: unknown; enum?: string[]; enumDescriptions?: string[] }
    >;
    const s = p['planRelay.notifications.sound'];
    expect(s?.default).toBe('off');
    expect(s?.enum).toEqual(['off', 'attention', 'all']);
    expect(s?.enumDescriptions).toHaveLength(3);
  });
});
