/** workspaceState key that marks the view as already revealed in this workspace. */
export const REVEALED_KEY = 'planRelay.panelRevealed';

/**
 * Says whether the view should be revealed on activation: only the first time the
 * workspace has plans. `alreadyRevealed` is the value stored in workspaceState.
 */
export function shouldReveal(alreadyRevealed: boolean | undefined, hasPlans: boolean): boolean {
  return hasPlans && alreadyRevealed !== true;
}
