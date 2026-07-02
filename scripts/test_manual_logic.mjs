import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const manual = require('../docs/manual_logic.js');

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

const output = manual.normalizeManualEntry(
  { id: 'memo-3', body: '하이닉스 사이트와 카카오 PNG 이미지 출력만 기준으로 사용' },
  { sourceType: 'memo' },
);
assert.equal(output.category, 'output');
assert.match(output.body, /하이닉스 사이트 화면과 카카오 전달용 PNG 이미지/);

const firebasePayload = {
  entries: {
    remote_share: {
      category: 'chat',
      title: '공유 기준',
      body: '카카오 공유는 PNG 파일로 직접 확인',
      tags: ['kakao'],
      updated_at_ms: 3,
    },
  },
  pending_memos: {
    memo_remote_order: {
      memo: '발주 재고 부족하면 주문 단위 확인 후 처리',
      created_at_ms: 4,
    },
  },
};
const firebaseManual = manual.normalizeFirebaseManualPayload(firebasePayload, { sourcePath: '/packhelper/ops_manual' });
assert.equal(firebaseManual.entries.length, 1);
assert.equal(firebaseManual.entries[0].category, 'chat');
assert.equal(firebaseManual.memos.length, 1);
assert.equal(firebaseManual.memos[0].category, 'order');

const mergedFirebase = manual.mergeManualFromFirebasePayload([], [], firebasePayload, { sourcePath: '/packhelper/ops_manual' });
assert.ok(mergedFirebase.some((item) => item.category === 'chat' && item.tags.includes('kakao')));
assert.ok(mergedFirebase.some((item) => item.category === 'order' && /발주/.test(item.body)));

const nestedFirebase = manual.normalizeFirebaseManualPayload({
  data: {
    remote_output: {
      title: '하이닉스 출력',
      body: '하이닉스 사이트 PNG 출력 기준',
    },
  },
});
assert.equal(nestedFirebase.entries.length, 1);
assert.equal(nestedFirebase.entries[0].category, 'output');

const conflicts = manual.detectManualConflicts([
  { title: '자동', body: '카카오 자동 발송' },
  { title: '수동', body: '자동 발송하지 않고 PNG 파일로 직접 확인' },
]);
assert.ok(conflicts.some((text) => text.includes('카카오 공유')));

const filtered = manual.filterManualEntries(merged, { query: '공유', category: 'chat', tag: 'kakao' });
assert.equal(filtered.length, 1);

const indexSource = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
assert.match(indexSource, /manual_logic\.js/);
assert.match(indexSource, /data-tab="ops"/);

const manualSource = readFileSync(new URL('../docs/manual_logic.js', import.meta.url), 'utf8');
assert.doesNotMatch(manualSource, /app\/src\/main\/assets|NativeBridge|adb|apk|usb|서버폰/i);

console.log('manual logic tests passed');
