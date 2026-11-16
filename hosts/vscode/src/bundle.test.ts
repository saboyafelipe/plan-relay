// The give-up confirmation page only binds what the host already drew: its bundle must not carry the string tables
// nor the panel render. A top-level call in a shared module is enough to bring them back, unseen.
import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The minified confirmation bundle: its size and the bytes each input file puts in it. */
async function confirmationBundle(): Promise<{ bytes: number; inputs: Record<string, number> }> {
  const r = await build({
    absWorkingDir: HOST,
    entryPoints: ['src/webview/confirmation.ts'],
    bundle: true,
    minify: true,
    write: false,
    metafile: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2022',
    logLevel: 'silent',
  });
  const [output] = Object.values(r.metafile.outputs);
  if (!output) throw new Error('no output');
  return { bytes: output.bytes, inputs: Object.fromEntries(Object.entries(output.inputs).map(([f, i]) => [f, i.bytesInOutput])) };
}

describe('the confirmation bundle', () => {
  it('leaves out the string tables and stays small (the render alone would pass the limit)', async () => {
    const { bytes, inputs } = await confirmationBundle();
    const tables = Object.entries(inputs)
      .filter(([file, n]) => n > 0 && /core\/i18n\/[^/]+\.json$/.test(file))
      .map(([file]) => file);
    expect(tables).toEqual([]);
    expect(bytes).toBeLessThan(10_000);
  });
});
