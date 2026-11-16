// A large, deterministic plan for the panel v2 tests: 12 phases, 540 tasks,
// subtasks two levels deep (`F1-05.1`, `F1-10.1.1`), every group of contract 1 and chained
// dependencies. The first phases done, the middle ones in progress, the last ones in draft.
import type { StatusInput, PhaseInput, TaskGroup, TaskTier, TaskInput } from '../input';

export const LARGE_PLAN_PHASES = 12;
const BY_PHASE = 30;
const TRACKS = ['panel', 'plugin', 'contrato', 'ci', 'i18n'] as const;
const TYPES = ['code', 'code', 'research', 'review', 'decision', 'human'] as const;
const TIERS: readonly TaskTier[] = ['junior', 'mid', 'senior'];

/** The group of a task by position: the plan goes from phase 0 to 11. */
function groupOf(phase: number, n: number, sub: number): TaskGroup {
  if (phase < 5) return 'done';
  if (phase === 5) return n % 7 === 0 ? 'cancelled' : 'done';
  if (phase < 9) {
    if (n <= 12) return 'done';
    if (n === 13 + (phase - 6)) return 'in-progress';
    if (n % 9 === 0) return 'owner';
    if (n % 4 === 0 || sub > 0) return 'available';
    if (n === 29) return 'invalid';
    return 'blocked';
  }
  return 'draft';
}

function timeAt(phase: number, n: number): string {
  const day = String(1 + ((phase * 2 + Math.floor(n / 15)) % 28)).padStart(2, '0');
  const h = String(n % 24).padStart(2, '0');
  return `2026-10-${day}T${h}:00Z`;
}

function newTask(phase: number, dir: string, id: string, n: number, sub: number, blocked_by: string[]): TaskInput {
  const group = groupOf(phase, n, sub);
  const starts = group === 'done' || group === 'in-progress' || group === 'cancelled';
  return {
    id,
    title: `Task ${id} da fase ${phase}, com um título longo o bastante para cortar na largura da view`,
    file: `${dir}/${id}-task.md`,
    group,
    type: TYPES[(n + sub) % TYPES.length] ?? 'code',
    track: TRACKS[(phase + n) % TRACKS.length] ?? 'panel',
    tier: TIERS[(n + sub) % TIERS.length] ?? 'mid',
    repos: [],
    blocked_by,
    unblocks: 0,
    started: starts ? timeAt(phase, n) : null,
    finished: group === 'done' ? timeAt(phase, n + 1) : null,
    next_step: group === 'in-progress' ? `retomar o passo ${n % 5} de ${id}` : null,
    waiting_on: [],
  };
}

/** The status of the large plan, in the shape of `status.sh --json` (only the keys the panel reads). */
export function largePlan(): StatusInput {
  const tasks: TaskInput[] = [];
  const phases: PhaseInput[] = [];
  for (let f = 0; f < LARGE_PLAN_PHASES; f++) {
    const dir = `phase-${f}-fase-${f}`;
    const phaseTasks: TaskInput[] = [];
    for (let n = 1; n <= BY_PHASE; n++) {
      const id = `F${f}-${String(n).padStart(2, '0')}`;
      const before = n > 1 ? [`F${f}-${String(n - 1).padStart(2, '0')}`] : f > 0 ? [`F${f - 1}-${BY_PHASE}`] : [];
      phaseTasks.push(newTask(f, dir, id, n, 0, before));
      if (n % 5 === 0) {
        for (let s = 1; s <= 2; s++) phaseTasks.push(newTask(f, dir, `${id}.${s}`, n, s, s === 1 ? [] : [`${id}.1`]));
      }
      if (n % 10 === 0) phaseTasks.push(newTask(f, dir, `${id}.1.1`, n, 3, [`${id}.1`]));
    }
    tasks.push(...phaseTasks);
    phases.push({
      dir,
      title: `Fase ${f} — nome da fase ${f}`,
      done: phaseTasks.filter((t) => t.group === 'done').length,
      total: phaseTasks.filter((t) => t.group !== 'cancelled').length,
      in_progress: phaseTasks.filter((t) => t.group === 'in-progress').length,
    });
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));
  for (const t of tasks) {
    for (const b of t.blocked_by) {
      const before = byId.get(b);
      if (!before) continue;
      if (t.group !== 'done' && t.group !== 'cancelled') before.unblocks++;
      if (t.group === 'blocked' && before.group !== 'done') t.waiting_on.push(b);
    }
  }
  const done = tasks.filter((t) => t.group === 'done').length;
  const total = tasks.filter((t) => t.group !== 'cancelled').length;
  return {
    progress: { done, total, pct: Math.round((done / total) * 100) },
    phases,
    tasks,
    parallel: tasks
      .filter((t) => t.group === 'available')
      .slice(0, 3)
      .map((t) => t.id),
    run: { open: true, log: 'notes/run-2026-10-20.md' },
  };
}
