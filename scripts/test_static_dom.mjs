import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../docs/style.css', import.meta.url), 'utf8');
const manualSource = readFileSync(new URL('../docs/manual_logic.js', import.meta.url), 'utf8');
const manualSeedSource = readFileSync(new URL('../docs/ops_manual_seed.js', import.meta.url), 'utf8');

function visibleHtmlText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const publicText = visibleHtmlText(indexSource);

assert.match(indexSource, /authModeBadge/);
assert.match(indexSource, /previewBanner/);
assert.match(indexSource, /workEditBtn/);
assert.match(indexSource, /stdPanel/);
assert.match(indexSource, /opsCon/);
assert.match(indexSource, /ops_manual_seed\.js/);
assert.match(indexSource, /data-tab="dashboard">브리핑</);
assert.match(indexSource, /data-tab="ops">운영메뉴얼</);
assert.match(indexSource, /<meta name="viewport" content="width=device-width,initial-scale=1\.0">/);
assert.doesNotMatch(indexSource, /user-scalable\s*=\s*no/i);

for (const [id, label] of [
  ['selStart', '근무 시작 시간'],
  ['selEnd', '근무 종료 시간'],
  ['empRole', '직원 역할'],
  ['doEmpSel', '휴무 직원 선택'],
  ['doDate', '휴무 날짜'],
]) {
  assert.match(indexSource, new RegExp(`<[^>]*id="${id}"[^>]*aria-label="${label}"`));
}
assert.match(indexSource, /<input[^>]*id="doDate"[^>]*name="dayoffDate"/);

for (const [id, label] of [['prevW', '이전 주'], ['prevD', '이전 날짜'], ['nextD', '다음 날짜'], ['nextW', '다음 주']]) {
  assert.match(indexSource, new RegExp(`<button[^>]*id="${id}"[^>]*aria-label="${label}"[^>]*min-width:44px[^>]*min-height:44px`));
}
assert.match(indexSource, /<button class="date-display" id="dateDisp" type="button" aria-label="날짜 선택"><\/button>/);
assert.doesNotMatch(indexSource, /<span class="date-display" id="dateDisp"/);
assert.match(appSource, /\$\('dateDisp'\)\.addEventListener\('click',\(\)=>openDP\(\)\);/);
assert.doesNotMatch(appSource, /dateDisp[^\n]*addEventListener\('(keydown|keyup|keypress)'/);

for (const term of ['source text', 'preview queue', 'source_event_id', 'upsert_shift', 'execute_live_write', 'confirmed request preview', 'CLI 보정', 'note 실제']) {
  assert.doesNotMatch(indexSource, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
assert.doesNotMatch(publicText, /(?<!운영)메뉴얼/);
for (const term of ['source_event_id', 'execute_live_write', 'preview queue', 'confirmed request preview', 'upsert_shift', 'source text url image kakao cli timer site', 'CLI 보정 후보']) {
  assert.doesNotMatch(publicText, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
for (const term of ['운영메뉴얼', '카톡 이미지 확인', '선택한 이미지를 고르면 반영 요청 내용이 보입니다.', '선택한 이미지 반영 요청', '보조정보 정리 대기', '텍스트', '주소', '이미지', '카카오', '타이머', '사이트']) {
  assert.match(publicText, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.match(appSource, /syncPreviewModeUI/);
assert.match(appSource, /PREVIEW_ONLY/);
assert.match(appSource, /publicManualCardModel/);
assert.match(appSource, /confirmPayloadPreviewText/);
assert.match(appSource, /CONFIRM_ACTION_VALUE_TO_CODE/);
assert.match(appSource, /authModeBadge/);
assert.match(appSource, /previewBanner/);
assert.match(appSource, /seedManualEntries/);
assert.match(appSource, /data-go-tab="ops"/);
assert.match(appSource, /data-go-std="1"/);
assert.match(appSource, /bindSurfaceCollapse/);
assert.match(appSource, /commitDailySchedule/);
assert.match(appSource, /commitFixedSchedule/);
assert.match(appSource, /saveQuickShift/);
assert.match(appSource, /setShiftPreset/);
assert.match(appSource, /원천 반영\/출력 동기화됨/);

const focusStdStart = appSource.indexOf('function focusStdPanel()');
const focusStdEnd = appSource.indexOf('const surfaceCollapseSyncs', focusStdStart);
const focusStdSource = appSource.slice(focusStdStart, focusStdEnd);
const focusOpenIndex = focusStdSource.indexOf("panel.classList.remove('collapsed')");
const focusAriaIndex = focusStdSource.indexOf("panel.querySelector('.surface-toggle')?.setAttribute('aria-expanded','true')");
const focusScrollIndex = focusStdSource.indexOf('panel.scrollIntoView');
const focusHighlightIndex = focusStdSource.indexOf("panel.classList.add('highlight')");
assert.ok(focusStdStart >= 0 && focusStdEnd > focusStdStart, 'focusStdPanel source block must exist');
assert.ok(focusOpenIndex >= 0, 'focusStdPanel must open the collapsed panel');
assert.ok(focusAriaIndex > focusOpenIndex, 'focusStdPanel must sync aria-expanded after opening');
assert.ok(focusScrollIndex > focusAriaIndex, 'focusStdPanel must open the panel before scrolling');
assert.ok(focusHighlightIndex > focusScrollIndex, 'focusStdPanel must preserve highlight after scrolling');

assert.match(styleSource, /\.auth-mode-badge/);
assert.match(styleSource, /\.preview-banner/);
assert.match(styleSource, /\.ops-manual-card/);
assert.match(styleSource, /\.dash-callout-card/);
assert.match(styleSource, /\.dash-manual-item/);
assert.match(styleSource, /\.surface-panel/);
assert.match(styleSource, /\.surface-panel \.surface-head \.surface-toggle\{[^}]*width:44px;[^}]*height:44px;/);
assert.match(styleSource, /\.ops-body/);
assert.match(styleSource, /\.date-display\{[^}]*min-height:44px[^}]*cursor:pointer/);
assert.match(styleSource, /\.date-display:focus-visible/);
assert.match(indexSource, /저장 전 내용을 확인한 뒤 반영합니다\./);

assert.match(manualSource, /publicManualCardModel/);
assert.doesNotMatch(manualSource, /NativeBridge|adb|apk|usb|서버폰/i);
assert.match(manualSeedSource, /manual_baemin_customer_menu_change/);
assert.match(manualSeedSource, /manual_coupangeats_customer_menu_change/);
assert.match(manualSeedSource, /manual_bbq_app_order_change/);
assert.match(manualSeedSource, /manual_bbq_gifticon_menu_change/);

console.log('static DOM tests passed');
