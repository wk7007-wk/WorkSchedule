import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../docs/style.css', import.meta.url), 'utf8');
const manualSource = readFileSync(new URL('../docs/manual_logic.js', import.meta.url), 'utf8');
const manualSeedSource = readFileSync(new URL('../docs/ops_manual_seed.js', import.meta.url), 'utf8');

assert.match(indexSource, /authModeBadge/);
assert.match(indexSource, /previewBanner/);
assert.match(indexSource, /workEditBtn/);
assert.match(indexSource, /stdPanel/);
assert.match(indexSource, /opsCon/);
assert.match(indexSource, /ops_manual_seed\.js/);
assert.match(indexSource, /data-tab="dashboard">브리핑</);
assert.match(indexSource, /data-tab="ops">운영메뉴얼</);

assert.match(appSource, /syncPreviewModeUI/);
assert.match(appSource, /PREVIEW_ONLY/);
assert.match(appSource, /publicManualCardModel/);
assert.match(appSource, /preview_mode:PREVIEW_ONLY/);
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
