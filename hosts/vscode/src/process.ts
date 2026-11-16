// Runs a process with a timeout (today, only the agent's CLI: the plans' state comes from core/reader). The process
// runs in its own group: on timeout the whole group is killed, so a child (a `sleep`, a stuck `awk`) does not hold
// stdout and delay the response.
import { spawn } from 'node:child_process';
import { stringsFor, type Strings } from '@plan-relay/i18n';

export interface ProcessError {
  error: string;
}

export interface ProcessOutput {
  stdout: string;
  stderr: string;
}

export interface ProcessOptions {
  cwd: string;
  timeoutMs: number;
  /** Name in the error messages ("<agent> plugin list"). */
  name: string;
  /** The language of the error messages (English without it). */
  strings?: Strings;
}

const MAX_OUTPUT = 10 * 1024 * 1024;
const HEAD_LENGTH = 200;

/** The start of a text on a single line, to fit in a message. */
export function headOf(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > HEAD_LENGTH ? `${t.slice(0, HEAD_LENGTH)}…` : t;
}

/** Gives the output when the process exits with 0; otherwise an error with the start of stderr (or stdout). */
export function runProcess(command: string, args: string[], options: ProcessOptions): Promise<ProcessOutput | ProcessError> {
  const { name } = options;
  const { t } = options.strings ?? stringsFor();
  return new Promise((resolveFn) => {
    let stdout = '';
    let stderr = '';
    let finished: ProcessOutput | ProcessError | undefined;
    const finish = (r: ProcessOutput | ProcessError) => {
      if (finished) return;
      finished = r;
      clearTimeout(clock);
      resolveFn(r);
    };
    // windowsHide: on Windows, `detached` would open a console window for the process (the sound's PowerShell).
    const child = spawn(command, args, { cwd: options.cwd, detached: true, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const kill = () => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // the group has already ended
      }
    };
    const clock = setTimeout(() => {
      kill();
      finish({ error: t('process.timeout', name, options.timeoutMs) });
    }, options.timeoutMs);
    child.stdout.setEncoding('utf8').on('data', (d: string) => {
      stdout += d;
      if (stdout.length > MAX_OUTPUT) {
        kill();
        finish({ error: t('process.outputTooLarge', name) });
      }
    });
    child.stderr.setEncoding('utf8').on('data', (d: string) => {
      if (stderr.length < MAX_OUTPUT) stderr += d;
    });
    child.on('error', (e) => finish({ error: t('process.didNotStart', name, e.message) }));
    child.on('close', (exitCode, signal) => {
      if (exitCode === 0) {
        finish({ stdout, stderr });
        return;
      }
      const how = exitCode !== null ? t('process.exitedWith', exitCode) : t('process.endedBy', String(signal));
      const detail = headOf(stderr) || headOf(stdout);
      finish({ error: `${name} ${how}${detail ? `: ${detail}` : ''}` });
    });
  });
}
