import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../docs/style.css', import.meta.url), 'utf8');

function declaration(selector, property) {
  const match = css.match(new RegExp(`${selector.replace(/\./g, '\\.')}` + String.raw`\s*\{([^}]*)\}`));
  assert.ok(match, `missing ${selector} rule`);
  const value = match[1].match(new RegExp(`${property}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(value, `missing ${property} in ${selector}`);
  return value[1];
}

function luminance(hex) {
  const channels = hex.slice(1).match(/../g).map((value) => parseInt(value, 16) / 255);
  const linear = channels.map((value) => value <= 0.04045
    ? value / 12.92
    : ((value + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

const background = declaration('.auth-card', 'background');
const foreground = declaration('.auth-msg.err', 'color');
const ratio = (Math.max(luminance(background), luminance(foreground)) + 0.05)
  / (Math.min(luminance(background), luminance(foreground)) + 0.05);

assert.ok(ratio >= 4.5, `auth error contrast ${ratio.toFixed(3)}:1 must be at least 4.5:1`);
console.log(`auth error contrast ${ratio.toFixed(3)}:1 (${foreground} on ${background})`);
