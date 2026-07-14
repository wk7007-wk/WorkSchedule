# WorkSchedule Calendar Core / Overlay contract

## 현재 MVP 경계

- 상태: reusable logic + server-side sync engine/mock tests 완료. live OAuth, Firebase worker 기동, Google/KMA/KASI 자격증명, 배포는 차단 상태다.
- 사용자 1차 UI 대상은 WorkSchedule GitHub Pages가 아니라 Hynix 근무표 탭이다.
  - WorkSchedule 관리면: `/root/WorkSchedule/docs` -> `https://wk7007-wk.github.io/WorkSchedule/`
  - Hynix consumer: `/root/my-first-project/AttendanceBoard/docs/hynix` -> `https://poskds-attendance.web.app/hynix/`
- 이 커밋은 Hynix HTML/CSS/app을 수정하지 않는다. Hynix day/week/month 입력 UI와 실제 브라우저/live deploy 검증은 다음 단일 executor 작업이다.

## 논리 2계층

### 1. Calendar Core

- schedule canonical: `/workschedule_v2`
- 입력 root: `employees`, `fixed_schedules`, `overrides`, `status`
- resolver: `overrides state=shift|off|clear` -> `fixed_schedules` -> missing
- attendance: `/workschedule_v2/attendance`이며 계획 근무 입력/Google import 대상이 아니다.
- Google adapter metadata: `/workschedule_v2/meta/calendar_core/google`
  - `outbox`, `mappings`, `mirror`, `sync_state`, `audit`, `conflicts`, `pull_signals`, `channel`, `public_config`
- metadata/event projection/Google mirror는 canonical schedule source가 아니다.

### 2. Calendar Overlay

- cache/read-model: `/workschedule_v2/meta/calendar_overlay/{yyyy-MM-dd}`
- 필드 contract: `weather.precipitation_mm`, `weather.precipitation_probability_pct`, `weather.humidity_pct`, `basis_at`, `fetched_at_ms`, `expires_at_ms`, `sunrise`, `sunset`, `holiday`, `source`, `provider_mode`, `limitations`.
- `0`, `[]`, 빈 문자열처럼 의미 있는 값은 truthy 검사로 버리지 않는다.
- overlay missing/stale/provider failure는 Core 저장, 기존 row, outbox를 막거나 덮지 않는다.

## Hynix consumer exact interface

1. `docs/calendar_core_logic.js`를 Hynix deploy tree에 mirror하고 먼저 로드한다.
   - browser global: `window.WorkScheduleCalendarCoreLogic`
   - namespace: `CALENDAR_NAMESPACE`
   - permanent fixed write: `buildPermanentFixedSchedule(existing, patch, {nowMs, source})`
   - non-blocking save hook: `saveCoreThenQueue(writeCore, queueOutbox, item, onOutboxError)`
   - stable outbox: `buildOutboxItem({entity,date,employeeId,row,nowMs})`
   - overlap/sort/light: `computeOverlap`, `sortEmployeeIdsForDate`, `classifyShiftLight`, `buildDayGradient`
2. `docs/calendar_view_logic.js`를 같은 deploy tree에 mirror하고 Core 다음에 로드한다.
   - browser global: `window.WorkScheduleCalendarViewLogic`
   - input: `buildCalendarModel({anchor,view,employees,employeeIds,overlays,resolveShift,resolveOff,resolveStatus})`
   - output: `renderCalendarMarkup(model)`
   - delegated UI hooks: `data-calendar-view`, `data-calendar-select-day`, `data-calendar-create-day`, `data-calendar-slot-date`, `data-calendar-slot-minute`, `data-calendar-event`, `data-calendar-date`, `data-calendar-employee`
3. Hynix save adapter는 `writeCore`로 `/workschedule_v2/overrides|status`를 먼저 성공시킨 뒤 outbox를 예약한다. outbox reject/timeout은 UI에 sync pending으로만 보이고 Core 성공을 rollback하지 않는다.
4. 날짜별 편집은 `overrides`; 고정 변경은 `fixed_schedules`에 만기 없이 영구 저장한다. `buildPermanentFixedSchedule`은 기존 unknown field, 빈 배열, 0을 보존하고 legacy expiry field를 새 row에 쓰지 않는다.

## Server exact interface

- barrel: `server/calendar_sync/index.mjs`
- config: `loadCalendarSyncConfig(env)`; 기본 `featureEnabled=false`, `killSwitch=true`, provider `mock`.
- 운영일 경계: `WORKSCHEDULE_OPERATIONAL_DAY_START_MIN`, 기본 `360`(06:00). canonical `7/14 02:00`은 Google `7/15 02:00`으로 내보내고 timed pull은 다시 `7/14`로 역변환한다. all-day 휴무 날짜는 이동하지 않는다.
- engine:
  - `processOutbox()`
  - `pullChanges({reason})`
  - `reconcileCanonicalWindow({startDate,endDate,reason})`
  - `acceptWebhook(headers)`
  - `processPullSignals()`
  - `ensurePushChannel()`
  - `runCycle({reason})`
- store: `MemorySyncStore` for local tests, `FirebaseScheduleStore` for server worker.
- provider: `MockCalendarProvider`, `GoogleCalendarProvider`.
- OAuth/token: `GoogleOAuthServerFlow` + AES-256-GCM `EncryptedFileTokenStore`. Client ID/secret, refresh token, encryption key는 browser/source tree에 두지 않는다.

## Sync guarantees

- event identity: private extended properties `wsSchema`, `wsCanonicalKey`, `wsMappingId`, `wsDate`, `wsEmployeeId`, `wsRevision`, `wsState`, `wsRole` + server mapping row.
- idempotency: stable outbox id + canonical key mapping + Google base32hex 범위의 deterministic event ID. insert 응답 유실/409은 `events.get`으로 canonical key를 확인해 중복 생성 없이 회수한다. duplicate remote projection은 conflict로 격리한다.
- outbox fencing: pending/retry 또는 만료된 running row만 원자 claim하고 `lease_owner`/`lease_epoch`/`fence_token`이 일치할 때만 done/retry/conflict를 기록한다.
- move safety: 날짜 이동 대상의 explicit override가 없거나 같은 `google_event_id`일 때만 쓴다. fixed schedule만 있는 날짜는 허용하며 Firebase destination write는 ETag 조건부 PUT으로 경합을 차단한다.
- push: HTTPS webhook의 `X-Goog-*` channel/resource/token을 검증하고 body를 schedule data로 사용하지 않는다. `(channel, resource, message number)`로 dedupe한 signal을 lease/fence claim해 incremental pull 후 완료한다. periodic pull은 계속 authoritative recovery다.
- public status: `credentials_configured`, runtime `token_connected`, `live_auth_ready`를 분리한다. `push_ready`는 HTTPS URL, webhook token, signal consumer, live auth가 모두 준비되어야 true다.
- pull: initial full -> final-page `nextSyncToken` 저장 -> same base query params incremental pagination. HTTP 410은 mirror/token clear 후 full resync한다.
- conflict: Google ETag와 canonical revision이 둘 다 변하면 어느 쪽도 덮지 않고 `conflicts`에 남긴다.
- tombstone: Google cancelled/deleted event는 mapped 날짜 override `state=clear`; 계획 근무를 attendance에 쓰지 않는다.
- retry: retryable 429/5xx만 bounded backoff. kill switch/feature flag/auth blocker는 fail closed다.

## 검증

```bash
node scripts/test_calendar_core_logic.mjs
node scripts/test_calendar_sync_engine.mjs
node scripts/test_calendar_oauth.mjs
node scripts/test_calendar_firebase_store.mjs
```

공식 계약 참고:

- Google Calendar incremental sync: https://developers.google.com/workspace/calendar/api/guides/sync
- Google Calendar push: https://developers.google.com/workspace/calendar/api/guides/push
- Google Events resource: https://developers.google.com/workspace/calendar/api/v3/reference/events
- Google Events insert / caller-supplied ID constraints: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- Google OAuth web-server flow: https://developers.google.com/identity/protocols/oauth2/web-server
- KMA short-term forecast candidate: https://www.data.go.kr/data/15084084/openapi.do
- KASI holidays candidate: https://www.data.go.kr/data/15012690/openapi.do
- KASI sunrise/sunset candidate: https://www.data.go.kr/dataset/15012688/openapi.do?lang=en
