import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../docs/style.css', import.meta.url), 'utf8');

const rolePills = html.match(/<button[^>]*class="role-pill"[^>]*data-role="[^"]+"[^>]*>/g) || [];
assert.equal(rolePills.length, 3, 'quick edit must expose all three role choices as native buttons');
for (const pill of rolePills) {
  assert.match(pill, /type="button"/, 'role button must not submit an enclosing form');
  assert.match(pill, /aria-pressed="false"/, 'role button must start with an explicit unselected state');
}
assert.match(app, /setAttribute\('aria-pressed',smR\.includes\(p\.dataset\.role\)\?'true':'false'\)/,
  'role selection must synchronize aria-pressed');
assert.match(css, /\.role-pill\{[^}]*min-height:44px/, 'role buttons must provide a 44px minimum target');
assert.match(css, /\.role-pill:focus-visible\{[^}]*outline:3px solid #FFD866/, 'role button focus must be visible');
console.log('PASS quick edit role-pill accessibility contract');
