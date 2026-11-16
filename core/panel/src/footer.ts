// The environment footer: what is missing on the machine, from the list in the shape of `check.sh --json`. Only the
// ids reach the view; the `detail` of each check (how to fix it) is written by the host to its channel. Pure.
import type { EnvironmentInput, CheckInput } from './types';

export interface EnvironmentView {
  /** Required ones with status missing or warning. */
  missing: string[];
  /** Optional ones with status missing or warning. */
  attention: string[];
}

function isPending(c: CheckInput): boolean {
  // unknown is never an error (contract 1, §«check.sh --json»): it does not go in the footer.
  return c.status === 'missing' || c.status === 'warning';
}

export function environmentView(environment: EnvironmentInput): EnvironmentView {
  const pending = environment.checks.filter(isPending);
  return { missing: pending.filter((c) => c.required).map((c) => c.id), attention: pending.filter((c) => !c.required).map((c) => c.id) };
}
