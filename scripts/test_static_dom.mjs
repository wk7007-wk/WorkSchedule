import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexSource = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../docs/style.css', import.meta.url), 'utf8');
const manualSource = readFileSync(new URL('../docs/manual_logic.js', import.meta.url), 'utf8');

assert.match(indexSource, /authModeBadge/);
assert.match(indexSource, /previewBanner/);
assert.match(indexSource, /workEditBtn/);
assert.match(indexSource, /stdPanel/);
assert.match(indexSource, /opsCon/);

assert.match(appSource, /syncPreviewModeUI/);
assert.match(appSource, /PREVIEW_ONLY/);
assert.match(appSource, /publicManualCardModel/);
assert.match(appSource, /preview_mode:PREVIEW_ONLY/);
assert.match(appSource, /authModeBadge/);
assert.match(appSource, /previewBanner/);

assert.match(styleSource, /\.auth-mode-badge/);
assert.match(styleSource, /\.preview-banner/);
assert.match(styleSource, /\.ops-manual-card/);

assert.match(manualSource, /publicManualCardModel/);
assert.doesNotMatch(manualSource, /NativeBridge|adb|apk|usb|서버폰/i);

console.log('static DOM tests passed');
