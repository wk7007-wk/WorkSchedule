import { OPS_MANUAL_SEED_PAYLOAD, OPS_MANUAL_SEED_SOURCE } from './ops_manual_seed_data.mjs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const manual = require('../docs/manual_logic.js');

const FB = 'https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app';
const PATH = '/packhelper/ops_manual';
const URL = FB + PATH;

function countRows(value) {
  const normalized = manual.normalizeFirebaseManualPayload(value, { sourcePath: PATH });
  return {
    entries: normalized.entries.length,
    memos: normalized.memos.length,
    sourcePath: normalized.sourcePath,
  };
}

async function main() {
  const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run';
  const res = await fetch(URL + '.json');
  if (!res.ok) throw new Error(`read failed: ${res.status}`);
  const current = await res.json();
  const before = countRows(current);

  if (before.entries || before.memos) {
    console.log(JSON.stringify({ ok: false, reason: 'ops_manual_not_empty', before }, null, 2));
    process.exitCode = 2;
    return;
  }

  if (mode !== 'apply') {
    console.log(JSON.stringify({ ok: true, mode, source: OPS_MANUAL_SEED_SOURCE, before, after: countRows(OPS_MANUAL_SEED_PAYLOAD) }, null, 2));
    return;
  }

  const write = await fetch(URL + '.json', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(OPS_MANUAL_SEED_PAYLOAD),
  });
  if (!write.ok) throw new Error(`write failed: ${write.status}`);

  const verify = await fetch(URL + '.json');
  if (!verify.ok) throw new Error(`verify read failed: ${verify.status}`);
  const after = countRows(await verify.json());
  console.log(JSON.stringify({ ok: true, mode, source: OPS_MANUAL_SEED_SOURCE, before, after }, null, 2));
}

main().catch(err => {
  console.error(err && err.stack || err);
  process.exitCode = 1;
});
