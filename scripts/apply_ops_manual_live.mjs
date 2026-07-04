import { execFileSync } from 'node:child_process';
import { OPS_MANUAL_SEED_PAYLOAD, OPS_MANUAL_SEED_SOURCE } from './ops_manual_seed_data.mjs';

const URL = 'https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app/packhelper/ops_manual.json';

function curlRead() {
  return execFileSync('curl', ['-sS', '--max-time', '30', URL], { encoding: 'utf8' });
}

function curlWrite(payload) {
  execFileSync(
    'curl',
    ['-sS', '--max-time', '30', '-X', 'PUT', '-H', 'Content-Type: application/json', '--data-binary', '@-', URL],
    { input: JSON.stringify(payload), encoding: 'utf8' }
  );
}

function countRows(raw) {
  const value = JSON.parse(raw || '{}');
  const entries = Array.isArray(value && value.entries)
    ? value.entries
    : value && value.entries && typeof value.entries === 'object'
      ? Object.values(value.entries)
      : [];
  const memos = Array.isArray(value && value.memos)
    ? value.memos
    : value && value.memos && typeof value.memos === 'object'
      ? Object.values(value.memos)
      : [];
  return { entries, memos };
}

function main() {
  const before = countRows(curlRead());
  curlWrite(OPS_MANUAL_SEED_PAYLOAD);
  const after = countRows(curlRead());
  const addedIds = after.entries.slice(before.entries.length).map((item) => item && item.id).filter(Boolean);
  console.log(JSON.stringify({
    ok: true,
    source: OPS_MANUAL_SEED_SOURCE,
    before: { entries: before.entries.length, memos: before.memos.length },
    after: { entries: after.entries.length, memos: after.memos.length },
    addedIds,
  }, null, 2));
}

main();
