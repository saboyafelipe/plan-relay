// Small helpers shared across the extension. `errorMessage` and `isRecord` are defined once, in the reader.
import { isRecord } from '@plan-relay/reader';

export { errorMessage, isRecord } from '@plan-relay/reader';

/** `x` when it is a plain object, else `undefined`: for reading JSON that may be missing or of another shape. */
export function asRecord(x: unknown): Record<string, unknown> | undefined {
  return isRecord(x) ? x : undefined;
}
