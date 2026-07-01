# WorkSchedule APP_INTENT.md

## 만든 이유
- 매장 근무표, 휴무, 출근기록을 직원과 운영방이 같은 기준으로 보게 한다.

## 사용자 결과
- 공식 근무스케줄 URL은 `https://wk7007-wk.github.io/WorkSchedule/`다.
- 근무표 저장, 고정스케줄, 휴무, 출근기록이 Firebase 실패나 화면 전환 때문에 사라지면 안 된다.

## 절대 기준
- localStorage 우선, Firebase 백업/동기화 기준을 유지한다.
- 직원 삭제는 노드 삭제가 아니라 `disabled:true`, `active:false` 저장이다.
- 휴무 해제는 값을 false로 남기고 삭제하지 않는다.
- 표준입력은 공식 WorkSchedule 웹앱에서 `/workschedule_v2/overrides`, `status` SOT에 직접 저장한다.
- Firebase `/workschedule_v2`가 단일 근무 데이터 원본이고, WorkSchedule UI/HynixOps/StoreBotTermux/대시보드는 소비자다.
- 공통 해석 순서는 날짜별 `overrides` state=shift/off/clear → `fixed_schedules/{empId}` fallback → 미입력이다.
- 새 코드의 근무 해제/clear 값은 `false`가 기준이며, 빈 객체 `{}`는 legacy 호환으로만 본다.
- 출근 원본 `/packhelper/storebot_attendance/{date}`는 수정하지 않고, 읽은 일자 데이터만 `/workschedule_v2/attendance_history/{date}`에 idempotent PUT으로 보존해 누적 보기 기준으로 쓴다.
- StoreBot 근무표 브리핑은 WorkSchedule 데이터를 소비하지만, 원본 근무 데이터의 저장 경계는 WorkSchedule이 가진다.
- HynixOps는 발주/근무표 탭형 통합 런처 이름이며, OrderHelper와 WorkSchedule 원본 SOT는 합치지 않는다.
- 날씨 기준 지역은 `이천시 부발읍`이다. 좌표 상수는 근사 `37.2816, 127.4892`로 둔다.
- `이원규(emp1)` 고정근무 fallback은 매일 `17:00~06:00`으로 해석한다.
- 타임바/리스트 게이지는 06시 day-boundary 기준 선택 근무일의 당일 근무자 첫 출근~마지막 퇴근 범위만 쓴다.
- 정적 프론트 인증은 `PIN 통과 AND (CLI 허용 단말 OR 서버/호스팅 허용 IP OR 매장 GPS 150m)` 구조다. PIN은 항상 필요하고, 단말/IP allowlist 등록은 운영자 CLI 전용이다. 웹 화면에서 PIN+GPS로 단말을 자동 허용하지 않는다.
- IP allowlist는 CLI 기록/서버·호스팅 앞단 적용용이다. 정적 클라이언트의 임의 IP/X-Forwarded-For 값은 신뢰하지 않는다. `authDebug`는 로컬 개발에서만 GPS를 우회한다.

## UI/동선 기준
- HynixOps는 근무표 간단 입력 front이고, WorkSchedule은 Firebase SOT/출력/기존 상세 화면 역할을 유지한다.
- 사용자가 HynixOps에서 근무표를 수정할 때 기존 WorkSchedule 상세 UI를 기본으로 보게 하지 않는다.
- HynixOps 근무표 조정은 첫 화면의 primary action으로 열고, 편집 중에는 변경 수, 선택 셀 inspector, 기존→변경 비교, 닫기 확인, 저장 전 확인을 항상 기준으로 삼는다.
- HynixOps 주간 패턴 적용은 선택 직원/기간의 기존 근무를 새 패턴으로 덮어쓰기 요청하되, 원본 직접 저장이 아니라 `schedule_update` safe queue로만 접수한다.
- 기능 축소/숨김보다 근무표 입력과 상태 판별을 우선한다.
- 스와이프는 날짜 변경이며 탭 전환으로 바꾸지 않는다.
- 직원 공개 화면과 관리자 조작 화면의 경계를 섞지 않는다.

## 데이터/경계 기준
- 주요 경로는 `/workschedule_v2/employees`, `fixed_schedules`, `overrides`, `status`, 출근기록 경로다.
- 스키마 계약과 read-only 점검은 `/root/my-first-project/rules/workschedule_schema_contract.txt`와 `scripts/workschedule_schema_audit.py`를 기준으로 한다.
- Firebase 쓰기 실패 시 로컬 상태가 먼저 보존되어야 한다.
- StoreBot/근무표 PNG 경로를 바꿀 때는 StoreBotTermux와 `.agents/skills/storebot-kakao-reply` 기준을 같이 확인한다.

## C&I / AI Ops 경계
- C&I는 GitHub Pages 배포 실패, JS 오류, Firebase sync 불일치, StoreBot 근무표 소비 오류, 반복 사용자 보정 신호를 self_fix 후보로 올린다.
- 자동 복구는 웹 코드/문서/배포 보정과 검증까지 허용한다.
- 직원/근무 원본을 임의 삭제하거나, localStorage 우선 정책을 깨거나, 직원 공개 화면에 쓰기 기능을 섞는 자동 복구는 금지한다.
- CLI/LLM은 prompt envelope가 있어야 깨어난다. monitor/worker/사용자/수동 enqueue 또는 상주 판단 루프가 prompt를 주입하며, 이것은 C&I 판단 권한 제한이 아니다.

## 수정 전 질문
- 이 변경이 근무표 입력/조회 실수를 줄이는가.
- localStorage와 Firebase의 역할이 유지되는가.
- StoreBot 근무표 출력과 공식 URL 안내가 같이 맞는가.

## 완료 기준
- 검증: 브라우저 smoke, 저장/휴무/고정스케줄, Firebase 동기화.
- 전달: GitHub Pages 반영 확인.
- 남은 위험: 브라우저 캐시, Firebase 일시 실패, 직원 공개 화면 혼동.
