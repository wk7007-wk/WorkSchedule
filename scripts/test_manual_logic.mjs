import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const manual = require('../docs/manual_logic.js');
const assetManual = require('../app/src/main/assets/manual_logic.js');

const merged = manual.mergeManualFromMemo(
  [
    {
      id: 'share-base',
      category: 'chat',
      title: '카카오 공유 기준',
      body: '- 공유는 사용자가 대상 방을 확인한다.',
      tags: ['kakao'],
      updatedAt: 1,
    },
  ],
  [
    {
      id: 'memo-1',
      body: '카톡 자동전송 금지. 공유방 직접 확인해야함.',
      updatedAt: 2,
    },
  ],
);

assert.equal(merged.length, 1);
assert.equal(merged[0].category, 'chat');
assert.match(merged[0].body, /카카오톡 공유는 자동 발송하지 않고/);
assert.doesNotMatch(merged[0].body, /카톡 자동전송 금지/);
assert.ok(merged[0].tags.includes('kakao'));
assert.ok(merged[0].sourceCount >= 2);

const recipe = manual.normalizeManualEntry(
  { id: 'memo-2', body: '레시피 원본 수량은 타이머 탭 기준, 카카오봇은 주의사항만 답변' },
  { sourceType: 'memo' },
);
assert.equal(recipe.category, 'recipe');
assert.match(recipe.body, /레시피 세부 원본은 전용 영역/);

const conflicts = manual.detectManualConflicts([
  { title: '자동', body: '카카오 자동 발송' },
  { title: '수동', body: '자동 발송하지 않고 공유 시트에서 직접 확인' },
]);
assert.ok(conflicts.some((text) => text.includes('카카오 공유')));

const filtered = manual.filterManualEntries(merged, { query: '공유', category: 'chat', tag: 'kakao' });
assert.equal(filtered.length, 1);

assert.deepEqual(Object.keys(assetManual.CATEGORIES), Object.keys(manual.CATEGORIES));

for (const file of ['docs/index.html', 'app/src/main/assets/index.html']) {
  const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(source, /manual_logic\.js/);
  assert.match(source, /data-tab="ops"/);
}

console.log('manual logic tests passed');
