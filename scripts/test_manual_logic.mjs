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
assert.match(merged[0].body, /카카오톡 전달은 자동 발송하지 않고/);
assert.doesNotMatch(merged[0].body, /카톡 자동전송 금지/);
assert.ok(merged[0].tags.includes('kakao'));
assert.ok(merged[0].sourceCount >= 2);

const recipe = manual.normalizeManualEntry(
  { id: 'memo-2', body: '레시피 원본 수량은 타이머 탭 기준, 카카오봇은 주의사항만 답변' },
  { sourceType: 'memo' },
);
assert.equal(recipe.category, 'recipe');
assert.match(recipe.body, /레시피 세부값은 따로 확인하고 직원용 화면에는 안내만 둔다/);

const output = manual.normalizeManualEntry(
  { id: 'memo-3', body: '하이닉스 사이트와 카카오 PNG 이미지 출력만 기준으로 사용' },
  { sourceType: 'memo' },
);
assert.equal(output.category, 'output');
assert.match(output.body, /하이닉스 사이트 화면과 카카오 전달용 PNG 이미지/);

const employeeFacing = manual.normalizeManualEntry(
  { id: 'memo-4', title: '운영메뉴얼 입력 원칙', body: 'category tags search_text source status updated_at 원문 복붙 DB' },
  { sourceType: 'memo' },
);
assert.match(employeeFacing.title, /운영메뉴얼 새 내용 추가 방법|새 내용 알려주는 방법|입력 정리 기준|주문 변경 응대 기준|근무 변경 요청 방법/);
assert.doesNotMatch([employeeFacing.title, employeeFacing.summary, employeeFacing.body].join(' '), /source|status|updated_at|search_text|원문|복붙|DB|database/i);

const publicCard = manual.publicManualCardModel({
  id: 'memo-5',
  title: 'source id search_text updated_at codex_seed sourceTypes',
  body: 'source id search_text updated_at codex_seed sourceTypes',
  summary: 'source id search_text updated_at codex_seed sourceTypes',
  category: 'manual',
  sourceTypes: ['sourceTypes'],
  sourceIds: ['id'],
  sourceUrls: ['https://example.com/manual'],
});
const publicVisibleText = [publicCard.title, publicCard.summary, publicCard.body, publicCard.actions.join(' '), publicCard.cautions.join(' ')].join(' ');
assert.doesNotMatch(publicVisibleText, /source|id|search_text|updated_at|codex_seed|sourceTypes/i);
assert.equal(publicCard.category, 'manual');
assert.equal(publicCard.sourceUrls.length, 1);

const intakeEnvelope = manual.buildInputEnvelope(
  {
    text: '카카오 대화 정리',
    url: 'https://example.com/memo',
    attachments: [{ name: 'shot.png', type: 'image/png', size: 1024 }],
  },
  { sourceType: 'image', sourceLabel: '붙여넣기', sourceOrigin: 'workschedule_web' },
);
assert.equal(intakeEnvelope.requestType, 'codex_ops_intake');
assert.equal(intakeEnvelope.queueTarget, 'codex_ops');
assert.equal(intakeEnvelope.sourceType, 'image');
assert.ok(intakeEnvelope.decisionRequired.resource);
assert.match(intakeEnvelope.body, /URL: https:\/\/example.com\/memo/);
assert.match(intakeEnvelope.body, /\[image\] shot\.png/);
assert.ok(intakeEnvelope.searchIndex.includes('shot.png'));
assert.ok(Array.isArray(intakeEnvelope.candidateDomains));
assert.ok(intakeEnvelope.candidateDomains.includes('chat'));

const intakeMemo = manual.inputEnvelopeToManualMemo(intakeEnvelope);
assert.ok(intakeMemo.sourceTypes.includes('intake'));
assert.ok(intakeMemo.searchIndex.includes('shot.png'));

const candidateEnvelope = manual.classifyIntakeEnvelope({
  sourceType: 'cli',
  text: '근무표 수정하고 운영메뉴얼 정리',
});
assert.ok(candidateEnvelope.candidateDomains.includes('work'));
assert.ok(candidateEnvelope.candidateDomains.includes('manual'));

const firebasePayload = {
  entries: {
    remote_share: {
      category: 'chat',
      title: '공유 기준',
      body: '카카오 공유는 PNG 파일로 직접 확인',
      tags: ['kakao'],
      source_urls: ['https://example.com/share'],
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
assert.ok(firebaseManual.entries[0].sourceUrls.includes('https://example.com/share'));
assert.equal(firebaseManual.memos.length, 1);
assert.equal(firebaseManual.memos[0].category, 'order');

const mergedFirebase = manual.mergeManualFromFirebasePayload([], [], firebasePayload, { sourcePath: '/packhelper/ops_manual' });
assert.ok(mergedFirebase.some((item) => item.category === 'chat' && item.tags.includes('kakao')));
assert.ok(mergedFirebase.some((item) => item.category === 'order' && /발주/.test(item.body)));
assert.equal(manual.CATEGORIES.customer_support.label, '고객응대');
assert.equal(manual.CATEGORIES.platform_help.label, '앱주문');
assert.equal(manual.CATEGORIES.manual.label, '운영메뉴얼');
assert.equal(manual.CATEGORIES.coupon.label, '쿠폰');
assert.equal(manual.CATEGORIES.task.label, '할일');
assert.equal(manual.CATEGORIES.discount.label, '행사');

const briefing = manual.buildBriefingSections(
  [merged[0], recipe, output, intakeMemo],
  {
    schedule: {
      summary: '2026-07-03',
      count: 2,
      workSummary: '2명 출근',
      taskSummary: '1건',
      discountSummary: '0건',
      newsSummary: '0건',
      weatherSummary: '맑음',
      manualSummary: '오늘 필요한 운영메뉴얼',
    },
    intakeCount: 1,
  },
);
assert.ok(briefing.sections.some((section) => section.title === '할일/알람'));
assert.ok(briefing.sections.some((section) => section.title === '오늘 필요한 운영메뉴얼'));
assert.ok(briefing.indexable.some((item) => String(item.searchIndex || '').includes('shot.png')));

const emptyBriefing = manual.buildBriefingSections([], {
  schedule: {
    summary: '',
    count: 0,
    workSummary: '대기',
    taskSummary: '대기',
    discountSummary: '대기',
    newsSummary: '대기',
    weatherSummary: '대기',
    manualSummary: '대기',
  },
  intakeCount: 0,
});
assert.equal(emptyBriefing.sections[0].emptyState, '일정 대기');
assert.ok(emptyBriefing.sections.some((section) => section.pendingCount === 1));

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
assert.match(indexSource, /intakePanel/);
assert.match(indexSource, /intakeQueueBtn/);
assert.match(indexSource, /근무 수정/);

const appSource = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
assert.match(appSource, /briefing-sections/);
assert.match(appSource, /queueIntakeFromForm/);
assert.match(appSource, /ops-manual-more/);
assert.match(appSource, /intake-candidates/);
assert.match(appSource, /workEditBtn/);
assert.match(appSource, /OPS_MANUAL_CANDIDATE_PATH='\/packhelper\/ops_manual\/candidates'/);
assert.match(appSource, /async function queueIntakeItem/);
assert.match(appSource, /await enqueueOpsManualCandidate\(candidate\)/);
assert.match(appSource, /candidate_id:candidateId/);
assert.match(appSource, /schema_version:1/);
assert.match(appSource, /source_channel:'site'/);
assert.match(appSource, /source_event_id:sourceEventId/);
assert.match(appSource, /captured_at_ms:Number\(envelope\.capturedAtMs\)\|\|now/);
assert.match(appSource, /raw_payload:candidateRawValue\(rawInput,0\)/);
assert.match(appSource, /classification_hints:Object\.assign/);
assert.match(appSource, /status:'pending'/);
assert.match(appSource, /status_history:\[\{status:'pending'/);
assert.match(appSource, /pending local backup/);
assert.doesNotMatch(appSource, /\/packhelper\/ops_manual\/entries/);

const manualSource = readFileSync(new URL('../docs/manual_logic.js', import.meta.url), 'utf8');
assert.doesNotMatch(manualSource, /app\/src\/main\/assets|NativeBridge|adb|apk|usb|서버폰/i);
assert.match(manualSource, /buildInputEnvelope/);
assert.match(manualSource, /buildBriefingSections/);
assert.match(manualSource, /candidateDomainsForText/);

console.log('manual logic tests passed');
