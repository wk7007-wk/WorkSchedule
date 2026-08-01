import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../docs/style.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const stripLogic = app.slice(app.indexOf('let dateStripFocusDk'), app.indexOf('function loadJsonFromLocalStorage'));

assert.match(html, /id="dateStrip"[^>]+role="group"[^>]+aria-label="[^"]+"/,
  'date strip must expose an accessible group label');
assert.match(stripLogic, /<button type="button" class="date-strip-item/,
  'date choices must be native buttons');
assert.match(stripLogic, /for\(let i=-7;i<56;i\+\+\)/, 'date range contract must remain -7 through +55');
for (const token of ['aria-pressed', 'aria-disabled', 'aria-current="date"', 'tabindex']) {
  assert.ok(stripLogic.includes(token), `missing ${token}`);
}
for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Enter', "e.key===' '"]) {
  assert.ok(stripLogic.includes(key), `missing keyboard support for ${key}`);
}
assert.match(stripLogic, /dateStripRestoreFocus=true/, 'activation must request focus restoration');
assert.match(stripLogic, /if\(restore\)\{focusDateStripItem\(con,target\)/, 'rerender must restore focus to the active date');
assert.match(app, /swDateStrip=.*closest\('#dateStrip'\)/,
  'date-strip touch scrolling must be isolated from page date swipe');

assert.match(css, /\.date-strip\{[^}]*display:flex[^}]*overflow-x:auto[^}]*overflow-y:hidden/,
  'date strip must scroll horizontally without vertical overflow');
assert.match(css, /scroll-snap-type:x proximity/, 'date strip must provide horizontal scroll snapping');
assert.match(css, /\.date-strip-item:focus-visible\{[^}]*outline:3px solid #FFD866/,
  'keyboard focus must be visibly outlined');
assert.doesNotMatch(css, /\.date-strip-item\.ds-past\{[^}]*opacity:/,
  'past dates must not use opacity that weakens text contrast');

function channel(value) {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}
function luminance(hex) {
  const value = hex.replace('#', '');
  const rgb = value.length === 3
    ? [...value].map(c => parseInt(c + c, 16))
    : [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16));
  return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
}
function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
for (const foreground of ['#F4F4FA', '#C6C6D8', '#FF9B94', '#78E8DF', '#B8B8CA', '#C6C6D4', '#75E79C']) {
  assert.ok(contrast(foreground, '#1A1A30') >= 4.5, `${foreground} must meet 4.5:1 on the strip`);
}
for (const foreground of ['#FFFFFF', '#F2F1FF']) {
  assert.ok(contrast(foreground, '#594CC4') >= 4.5, `${foreground} must meet 4.5:1 when selected`);
}

for (const forbidden of ['fbP(', 'fbPatch(', 'fetch(', '/FW']) {
  assert.ok(!stripLogic.includes(forbidden), `date strip must not introduce write path ${forbidden}`);
}

console.log('PASS date strip accessibility contract');
