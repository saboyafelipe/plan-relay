// Validates JSON files against a JSON Schema (draft 2020-12) with ajv, a development
// dependency of the extension. Used by core/contract/conformance/validate.sh and by CI.
// Usage: node hosts/vscode/scripts/validate-schema.mjs <schema.json> <file.json>…
// Exits 0 when all pass, 1 when any fails, 2 on wrong usage.

import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';

const [schemaPath, ...files] = process.argv.slice(2);
if (!schemaPath || files.length === 0) {
  console.error('Usage: node validate-schema.mjs <schema.json> <file.json>…');
  process.exit(2);
}

const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')));

let failures = 0;
for (const file of files) {
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    failures++;
    console.log(`  FAIL ${file}: ${e.message}`);
    continue;
  }
  if (validate(data)) {
    console.log(`  ok    ${file}`);
  } else {
    failures++;
    console.log(`  FAIL ${file}`);
    for (const e of validate.errors ?? []) console.log(`        ${e.instancePath || '/'} ${e.message}`);
  }
}
process.exit(failures > 0 ? 1 : 0);
