import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../docs/app.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../docs/index.html', import.meta.url), 'utf8');
const styleSource = readFileSync(new URL('../docs/style.css', import.meta.url), 'utf8');

const start = appSource.indexOf('// === schedule image confirmation queue ===');
const end = appSource.indexOf('// === schedule delivery ===');
assert.ok(start > 0, 'confirmation queue block start missing');
assert.ok(end > start, 'confirmation queue block end missing');
const block = appSource.slice(start, end);

assert.match(appSource, /PREVIEW_QUEUE_PATH='\/packhelper\/storebot_termux\/work_schedule_image_preview_queue'/);
assert.match(appSource, /CONFIRMED_QUEUE_PATH='\/packhelper\/storebot_termux\/confirmed_schedule_write_requests'/);
assert.match(block, /request_type:'confirmed_schedule_write_request'/);
assert.match(block, /actor:confirmActor\(\)/);
assert.match(block, /source_event_id:source/);
assert.match(block, /date,employee,action/);
assert.match(block, /confirmed_at_ms:now/);
assert.match(block, /dry_run:PREVIEW_ONLY\|\|!live/);
assert.match(block, /execute_live_write:!PREVIEW_ONLY&&live/);
assert.match(block, /dry_run_result:Object\.assign/);
assert.match(block, /if\(PREVIEW_ONLY\|\|!live\)payload\.no_live_write=true/);
assert.match(block, /preview_mode:PREVIEW_ONLY/);
assert.match(block, /payload\.off=true/);
assert.match(block, /payload\.clear=true/);
assert.match(block, /payload\.shift=shift/);
assert.match(block, /fbP\(CONFIRMED_QUEUE_URL\+'\/'\+safeFbKey\(payload\.request_id\),payload\)/);
assert.match(block, /fbPatch\(PREVIEW_QUEUE_URL\+'\/'\+safeFbKey\(row\.key\),patch\)/);

assert.doesNotMatch(block, /fbP\(FW/);
assert.doesNotMatch(block, /fbPatch\(FW/);
assert.doesNotMatch(block, /fetch\(FW/);
assert.doesNotMatch(block, /\/packhelper\/storebot_attendance/);
assert.doesNotMatch(block, /\/workschedule(?!_v2)/);

for (const id of [
  'confirmPanel',
  'confirmList',
  'confirmDate',
  'confirmEmployee',
  'confirmAction',
  'confirmShift',
  'confirmOff',
  'confirmClear',
  'confirmLive',
  'confirmSend',
  'confirmReject',
  'confirmHold',
]) {
  assert.match(indexSource, new RegExp(`id="${id}"`));
}
assert.match(indexSource, /value="upsert_shift"/);
assert.match(indexSource, /value="off"/);
assert.match(indexSource, /value="clear"/);
assert.match(styleSource, /\.confirm-panel/);
assert.match(styleSource, /\.confirm-grid/);

console.log('confirmation panel static tests passed');
