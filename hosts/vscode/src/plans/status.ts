// Glue between core/reader and the disk: discovery and state of the plans, read with node:fs.
// Nothing here runs status.sh or any other workspace code.
import { discover, readStatus, type DiscoveredPlan, type Failure, type PlanStatus } from '@plan-relay/reader';
import { nodeFiles } from '@plan-relay/reader/node';

export type { DiscoveredPlan };

export function discoverPlans(folders: string[]): Promise<DiscoveredPlan[]> {
  return discover(nodeFiles, folders);
}

export function readPlanStatus(planDir: string): Promise<PlanStatus | Failure> {
  return readStatus(nodeFiles, planDir);
}
