// Small helpers shared across the reader, and through its index by the panel and the host (the one package both
// may import). No imports.

/** The text of a caught error: its message, or the value itself as text. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A plain object (not `null`, not an array): the shape of a JSON object. */
export function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
