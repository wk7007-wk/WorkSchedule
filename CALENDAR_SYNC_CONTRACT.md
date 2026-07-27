# WorkSchedule Calendar Core / Overlay contract

## 현재 MVP 경계

- 상태: reusable logic + server-side sync engine/mock tests 완료. live OAuth, Firebase worker 기동, Google/KMA/KASI 자격증명, 배포는 차단 상태다.
- 사용자 1차 UI 대상은 WorkSchedule GitHub Pages가 아니라 Hynix 근무표 탭이다.
  - WorkSchedule 관리면: `/root/WorkSchedule/docs` -> `https://wk7007-wk.github.io/WorkSchedule/`
  - Hynix consumer: `/root/my-first-project/AttendanceBoard/docs/hynix` -> `https://poskds-attendance.web.app/hynix/`
- Hynix source adapter는 `/root/my-first-project` commit `5a8fa8b`에 구현됐다. 실제 브라우저/live deploy와 Google OAuth worker 기동은 아직 차단 상태다.

## 논리 2계층

### 양쪽 공통 기능 교집합

- Hynix와 Google이 함께 표현하는 값은 `직원 식별`, `근무일`, `시작`, `종료`, `역할`, `휴무`, `삭제/clear`, `날짜 이동`뿐이다.
- 연결된 이벤트의 직원 식별은 stable mapping으로 고정한다. Google에는 Hynix의 직원 선택기가 없으므로 제목만 다른 직원명으로 바꿔 재배치하지 않으며, 직원 재배치는 Hynix에서 하거나 기존 이벤트 삭제 후 새 직원을 명시한 이벤트로 처리한다.
- 양쪽의 사용자 수정 범위와 맞춰 과거 날짜 write/import는 기본 차단한다. 기존 pending 과거 outbox는 activation 시 Google에 쓰지 않고 `skipped_past_date`로 안전 종료한다.
- Google 제목 형식은 `직원명 · 역할`, 휴무는 `휴무 · 직원명`이다. 제목의 역할 부분은 날짜/시간과 함께 canonical override로 돌아온다.
- Google 전용 `description`, `location`, `recurrence`, `attendees`, `reminders`, `transparency`, `visibility`, event color는 Hynix 기능으로 가장하지 않고 canonical에 import하거나 canonical projection으로 새로 쓰지 않는다.
- Hynix 전용 날씨, 공휴일, 일출/일몰, 겹침 게이지, 그라데이션/색상도 Google 이벤트로 내보내지 않는다.
- 공통 필드 밖의 Google 속성은 Google에 그대로 남을 수 있지만 동기화 판단과 충돌 판정의 입력으로 사용하지 않는다.

### 1. Calendar Core

- schedule canonical: `/workschedule_v2`
- 입력 root: `employees`, `fixed_schedules`, `overrides`, `status`
- resolver: `overrides state=shift|off|clear` -> `fixed_schedules` -> missing
- attendance: `/workschedule_v2/attendance`이며 계획 근무 입력/Google import 대상이 아니다.
- Google adapter metadata: `/workschedule_v2/meta/calendar_core/google`
  - `outbox`, `pull_lease`, `mappings`, `mirror`, `sync_state`, `audit`, `conflicts`, `pull_signals`, `channel`, `public_config`
- metadata/event projection/Google mirror는 canonical schedule source가 아니다.

### 2. Calendar Overlay

- cache/read-model: `/workschedule_v2/meta/calendar_overlay/{yyyy-MM-dd}`
- 필드 contract: `weather.precipitation_mm`, `weather.precipitation_probability_pct`, `weather.humidity_pct`, `basis_at`, `fetched_at_ms`, `expires_at_ms`, `sunrise`, `sunset`, `holiday`, `source`, `provider_mode`, `limitations`.
- `0`, `[]`, 빈 문자열처럼 의미 있는 값은 truthy 검사로 버리지 않는다.
- overlay missing/stale/provider failure는 Core 저장, 기존 row, outbox를 막거나 덮지 않는다.

## Hynix consumer exact interface

1. Hynix deploy tree의 `calendar_sync_logic.js`를 `app.js`보다 먼저 로드한다.
   - browser global: `window.HynixCalendarSyncLogic`
   - stable outbox: `buildOutboxItem({entity,dateKey,empId,row,nowMs,canonicalRoot})`
   - profile: `shared_schedule_intersection_v1`
2. Hynix save adapter는 `/workschedule_v2/overrides|status|fixed_schedules`를 먼저 성공시킨 뒤 같은 row revision의 outbox를 예약한다. outbox reject/timeout은 Core 성공을 rollback하지 않고 재시도 필요 상태로 표시한다.
3. 날짜별 편집은 `overrides`; 고정 변경은 `fixed_schedules`다. 고정 변경 outbox는 개별 날짜를 만들지 않고 bounded horizon reconciliation을 요청한다.
4. `docs/calendar_core_logic.js`와 `docs/calendar_view_logic.js`는 WorkSchedule의 재사용 가능한 Calendar UI/계산 모듈이며, 현재 Hynix 양방향 adapter 동작의 필수 런타임 파일은 아니다.

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
- store: `MemorySyncStore` for local tests, `FirebaseScheduleStore` for server worker. Firebase worker는 Admin RTDB 인스턴스로 `createFirebaseAdminAtomicImportWriter(database)`와 `createFirebaseAdminMappingCasWriter(database)`를 만들고 각각 `atomicImportWriter`, `mappingCasWriter`로 주입한다. 모든 Google canonical/status import는 `/workschedule_v2` 공통 루트 transaction, 모든 mapping mutation은 metadata transaction을 사용한다. REST-only store는 canonical/status/mapping write 전에 fail-closed한다. `createFirebaseAdminAtomicMoveWriter`/`atomicMoveWriter`는 이전 호출부용 alias다.
- provider: `MockCalendarProvider`, `GoogleCalendarProvider`.
- OAuth/token: `GoogleOAuthServerFlow` + AES-256-GCM `EncryptedFileTokenStore`. Client ID/secret, refresh token, encryption key는 browser/source tree에 두지 않는다.
- 개인폰 Hynix 화면의 수동 연결 버튼은 RTDB `public_config.oauth_start_path`가 고정 same-origin `/api/workschedule/calendar/oauth/start`이고 전용 Google credential 준비가 확인된 경우에만 관리자에게 활성화된다. 브라우저는 secret/token을 받지 않고 server OAuth 시작 endpoint로만 이동한다.

## Sync guarantees

- event identity: private extended properties `wsSchema`, `wsCanonicalKey`, `wsMappingId`, `wsDate`, `wsEmployeeId`, `wsRevision`, `wsState`, `wsRole` + server mapping row.
- idempotency: stable outbox id + canonical key mapping + Google base32hex 범위의 deterministic event ID. insert 응답 유실/409은 `events.get`으로 canonical key를 확인해 중복 생성 없이 회수한다. duplicate remote projection은 conflict로 격리한다.
- outbox fencing: 한 번에 한 row만 pending/retry 또는 만료된 running에서 원자 claim한다. 각 Google insert/update/delete와 mapping write 직전에 `lease_owner`/`lease_epoch`/`fence_token`/만료시각을 조건부 갱신하며, 현재 fence만 done/retry/conflict를 기록한다. 기본 lease는 provider timeout과 bounded retry/backoff 전체 예산보다 길다.
- import/move safety: source resolved revision과 source/destination explicit expectation을 모두 확인한다. 날짜 이동 대상의 explicit override가 없거나 같은 Google event version일 때만 쓴다. fixed schedule만 있는 날짜는 허용한다. 모든 Google import는 Admin transaction 한 번으로 `/workschedule_v2` 공통 루트의 override와 status를 함께 commit하며 employees, fixed schedule, attendance/meta, unrelated row, `[]`, `0`을 보존한다. 같은 event retry는 누락된 status만 복구하고 완료 후에는 idempotent다.
- push/pull fencing: HTTPS webhook의 `X-Goog-*` channel/resource/token을 검증하고 body를 schedule data로 사용하지 않는다. `(channel, resource, message number)`로 dedupe한 signal을 한 row씩 claim한다. signal pull과 periodic pull은 같은 metadata `pull_lease` owner/epoch/fence/expiry를 CAS claim·renew하고, page/canonical/mirror/mapping/sync-state write 전 current fence를 확인한다. older `event.updated`는 mirror/canonical/mapping 모두 stale-ignore하며, 같은 timestamp의 payload/ETag 불일치는 conflict로 fail-closed한다. periodic pull은 계속 authoritative recovery다.
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
