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

assert.doesNotMatch(publicText, /(?<!운영)메뉴얼/);
for (const term of ['source_event_id', 'execute_live_write', 'preview queue', 'confirmed request preview', 'upsert_shift', 'source text url image kakao cli timer site', 'CLI 보정 후보']) {
  assert.doesNotMatch(publicText, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
}
for (const term of ['운영메뉴얼', '카톡 이미지 확인', '확인 요청 미리보기', '반영 요청 내용', '보조정보 정리 대기', '텍스트', '주소', '이미지', '카카오', '타이머', '사이트']) {
  assert.match(publicText, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.match(appSource, /syncPreviewModeUI/);
assert.match(appSource, /PREVIEW_ONLY/);
assert.match(appSource, /publicManualCardModel/);
assert.match(appSource, /confirmPayloadPreviewText/);
assert.match(appSource, /authModeBadge/);
assert.match(appSource, /previewBanner/);
assert.match(appSource, /seedManualEntries/);
assert.match(appSource, /data-go-tab="ops"/);
assert.match(appSource, /data-go-std="1"/);

assert.match(styleSource, /\.auth-mode-badge/);
assert.match(styleSource, /\.preview-banner/);
assert.match(styleSource, /\.ops-manual-card/);
assert.match(styleSource, /\.dash-callout-card/);
assert.match(styleSource, /\.dash-manual-item/);

assert.match(manualSource, /publicManualCardModel/);
assert.doesNotMatch(manualSource, /NativeBridge|adb|apk|usb|서버폰/i);
assert.match(manualSeedSource, /manual_baemin_customer_menu_change/);
assert.match(manualSeedSource, /manual_coupangeats_customer_menu_change/);
assert.match(manualSeedSource, /manual_bbq_app_order_change/);
assert.match(manualSeedSource, /manual_bbq_gifticon_menu_change/);

console.log('static DOM tests passed');
