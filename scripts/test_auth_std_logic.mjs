import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const authStd = require('../docs/auth_std_logic.js');

const authConfig = {
  pinSha256: 'abc123',
  storeLat: 37.2528352,
  storeLng: 127.4900516,
  radiusM: 150,
  storageKey: 'workschedule_auth_device_v1',
};

const inside = authStd.verifyGpsPosition(
  { coords: { latitude: 37.2529, longitude: 127.4900 } },
  authConfig,
);
assert.equal(inside.factor, 'gps');
assert.ok(inside.distanceM < authConfig.radiusM);

const outside = authStd.verifyGpsPosition(
  { coords: { latitude: 37.2609, longitude: 127.5000 } },
  authConfig,
);
assert.match(outside.error, /반경 밖/);

const pinOk = await authStd.verifyPinText('1234', authConfig, async (text) => {
  if (text === '1234') return 'abc123';
  return 'nope';
});
assert.equal(pinOk.ok, true);

const pinFail = await authStd.verifyPinText('9999', authConfig, async (text) => {
  if (text === '9999') return 'wrong';
  return 'abc123';
});
assert.match(pinFail.error, /PIN이 맞지 않습니다/);

const statusRows = authStd.authStatusRows(authConfig, { token: 'saved-token' });
assert.equal(statusRows.length, 3);
assert.equal(statusRows[0].label, 'PIN');
assert.equal(statusRows[0].value, '설정됨');
assert.equal(statusRows[1].label, '위치');
assert.match(statusRows[1].value, /반경 150m/);
assert.equal(statusRows[2].value, '저장됨');

const request = authStd.buildStdWriteRequest(
  {
    date: '2026-07-04',
    employee: '이원규',
    employee_id: 'emp1',
    action: 'upsert_shift',
    start: '10:00',
    end: '18:00',
    role: '주방',
    note: '확인용',
  },
  { actor: '사장', nowMs: 1_725_000_000_000 },
);

assert.equal(request.request_type, 'confirmed_schedule_write_request');
assert.equal(request.dry_run, true);
assert.equal(request.execute_live_write, false);
assert.deepEqual(request.target_paths, ['/workschedule_v2/overrides', '/workschedule_v2/status']);
assert.equal(request.action, 'upsert_shift');
assert.equal(request.employee_id, 'emp1');
assert.equal(request.start, '10:00');
assert.equal(request.end, '18:00');
assert.equal(request.role, '주방');
assert.equal(request.dry_run_result.ok, true);
assert.match(request.request_id, /^confirmed_schedule_write_request_std_/);
assert.match(authStd.summarizeStdRequest(request), /2026-07-04/);

const offRequest = authStd.buildStdWriteRequest(
  {
    date: '2026-07-04',
    employee: '이원규',
    action: 'off',
  },
  { actor: '사장', nowMs: 1_725_000_000_001 },
);
assert.equal(offRequest.off, true);
assert.match(authStd.summarizeStdRequest(offRequest), /휴무 요청/);

const missingTime = authStd.buildStdWriteRequest(
  {
    date: '2026-07-04',
    employee: '이원규',
    action: 'upsert_shift',
    start: '',
    end: '',
  },
  { actor: '사장', nowMs: 1_725_000_000_002 },
);
assert.match(missingTime.error, /근무 시간을 입력/);

console.log('auth/std logic tests passed');
