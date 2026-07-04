import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { OPS_MANUAL_SEED_PAYLOAD, OPS_MANUAL_SEED_SOURCE } from './ops_manual_seed_data.mjs';

const require = createRequire(import.meta.url);
const manual = require('../docs/manual_logic.js');

const normalized = manual.normalizeFirebaseManualPayload(OPS_MANUAL_SEED_PAYLOAD, { sourcePath: '/packhelper/ops_manual' });

assert.equal(OPS_MANUAL_SEED_PAYLOAD.source, OPS_MANUAL_SEED_SOURCE);
assert.equal(normalized.sourcePath, '/packhelper/ops_manual');
assert.equal(normalized.entries.length, 11);
assert.equal(normalized.memos.length, 0);

const categories = new Set(normalized.entries.map((item) => item.category));
for (const cat of ['order', 'manual', 'work', 'discount', 'delivery', 'task', 'customer_support', 'platform_help']) {
  assert.ok(categories.has(cat), `missing category ${cat}`);
}

for (const item of normalized.entries) {
  assert.ok(item.id);
  assert.ok(item.title);
  assert.ok(item.summary);
  assert.ok(item.body);
  assert.ok(Array.isArray(item.tags));
  assert.ok(item.tags.length > 0);
  assert.equal(item.status, 'active');
  assert.ok(Number.isFinite(item.updatedAt));
  assert.match(item.searchIndex, /source|status|updated_at|tags|manual|work|discount|delivery|task|order/i);
  assert.ok(Array.isArray(item.sourceUrls));
}

const merged = manual.mergeManualFromFirebasePayload([], [], OPS_MANUAL_SEED_PAYLOAD, { sourcePath: '/packhelper/ops_manual' });
assert.equal(merged.length, 11);
assert.ok(merged.every((item) => item.sourceTypes.includes(OPS_MANUAL_SEED_SOURCE) || item.sourceTypes.includes('manual')));
assert.ok(merged.some((item) => /닭다리 품절/.test(item.title)));
assert.ok(merged.some((item) => item.id === 'manual_bbq_gifticon_menu_change'));

console.log('ops manual seed tests passed');
