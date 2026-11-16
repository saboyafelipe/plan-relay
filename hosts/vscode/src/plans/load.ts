// Joins discovery and state reading: one result per plan, with state or error.
// The states are read in parallel and one plan's failure does not affect the others.
import { readerError, type ReaderError, type PlanStatus } from './contract';
import { discoverPlans, readPlanStatus } from './status';
import { errorMessage } from '../util';

interface Base {
  workspaceFolder: string;
  name: string;
  folder: string;
}

export type LoadedPlan = (Base & { status: PlanStatus }) | (Base & { error: ReaderError });

export async function load(folders: string[]): Promise<LoadedPlan[]> {
  const discovered = await discoverPlans(folders);
  return Promise.all(
    discovered.map(async (p): Promise<LoadedPlan> => {
      const base = { workspaceFolder: p.workspaceFolder, name: p.name, folder: p.folder };
      try {
        const r = 'error' in p ? p : await readPlanStatus(p.folder);
        return 'error' in r ? { ...base, error: r.error } : { ...base, status: r };
      } catch (e) {
        // The third-party (fs) message goes as an argument, untranslated.
        return { ...base, error: readerError('exception', errorMessage(e)) };
      }
    }),
  );
}
