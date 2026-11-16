// The optional alert sound. The VS Code extension API does not play sound and the accessibility signals are not
// exposed to extensions; playing through the webview depends on the panel being open. So the sound comes from the
// system player, with fixed arguments and no shell: nothing from the workspace runs. On macOS the player has a fixed
// path; on Linux and Windows it is looked up in the `PATH`. Off by default.
import type { Strings } from '@plan-relay/i18n';
import type { ProcessError, ProcessOutput } from '../process';
import { errorMessage } from '../util';
import type { AlertSettings } from './alert';
import type { EventType } from './events';

/** `planRelay.notifications.sound`: `attention` plays only on the alerts that need you. */
export type SoundLevel = 'off' | 'attention' | 'all';
export const SOUND_LEVELS: readonly SoundLevel[] = ['off', 'attention', 'all'];

export interface SoundCommand {
  command: string;
  args: string[];
}

/** Runs a process without a shell; the host passes its `runProcess`. */
export type RunCommand = (command: string, args: string[]) => Promise<ProcessOutput | ProcessError>;

/** The platform's players, in the order they are tried; empty where none is known. */
export function soundCommands(platform: NodeJS.Platform): SoundCommand[] {
  switch (platform) {
    case 'darwin':
      return [{ command: '/usr/bin/afplay', args: ['/System/Library/Sounds/Glass.aiff'] }];
    case 'linux':
      return [
        { command: 'paplay', args: ['/usr/share/sounds/freedesktop/stereo/complete.oga'] },
        { command: 'canberra-gtk-play', args: ['-i', 'complete'] },
      ];
    case 'win32':
      return [
        { command: 'powershell', args: ['-NoProfile', '-NonInteractive', '-Command', '[System.Media.SystemSounds]::Asterisk.Play()'] },
      ];
    default:
      return [];
  }
}

/** The configured level; any value outside the list counts as `off`. */
export function soundLevel(config: AlertSettings): SoundLevel {
  const v = config.get<unknown>('sound', 'off');
  return SOUND_LEVELS.find((n) => n === v) ?? 'off';
}

/** Whether the alert of this type plays at the given level (the alert must already be enabled). */
export function playsOnEvent(type: EventType, tier: SoundLevel): boolean {
  if (tier === 'all') return true;
  if (tier === 'attention') return type === 'handoff' || type === 'taskWaitingOnOwner';
  return false;
}

/**
 * Plays the platform sound: tries each player until one works. With none, writes a line to `register`
 * and moves on; never rejects.
 */
export async function playSound(
  platform: NodeJS.Platform,
  runCommand: RunCommand,
  register: (line: string) => void,
  { t }: Strings,
): Promise<void> {
  const commandList = soundCommands(platform);
  if (commandList.length === 0) {
    register(t('log.soundNoPlayer', platform));
    return;
  }
  let lastOne = '';
  for (const { command, args } of commandList) {
    try {
      const r = await runCommand(command, args);
      if (!('error' in r)) return;
      lastOne = r.error;
    } catch (e) {
      lastOne = errorMessage(e);
    }
  }
  register(t('log.soundFailed', lastOne));
}
