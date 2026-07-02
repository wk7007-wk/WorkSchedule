# WorkSchedule APP_INTENT.md

## 만든 이유
- 매장 근무표, 휴무, 출근기록을 Firebase DB 한 기준으로 관리하고, 하이닉스 사이트와 카톡 이미지 출력에 같은 근무표를 쓰게 한다.

## 사용자 결과
- WorkSchedule은 Android APK/설치형 앱이 아니다.
- surface_type은 `site/static-web` 또는 `docs web`이다.
- 공식 웹 출력은 `docs/` GitHub Pages `https://wk7007-wk.github.io/WorkSchedule/`다.
- 하이닉스 사이트/HynixOps, StoreBotTermux, 대시보드는 Firebase `/workschedule_v2`를 소비한다.
- 카톡 전달은 최신 근무표 PNG 이미지를 웹 공유 메뉴 또는 다운로드 파일로 출력한다.

## 절대 기준
- Firebase `/workschedule_v2`가 단일 근무 데이터 원본이다.
- 운영메뉴얼 durable source는 Firebase `/packhelper/ops_manual`이다. WorkSchedule/HynixOps는 이 경로를 읽기 전용으로 합산하고, `localStorage`는 인증 토큰, UI 상태, 운영메뉴얼 초안 후보, 이미지 출력 due 상태 같은 브라우저 보조 상태만 맡는다.
- 직원 삭제는 노드 삭제가 아니라 `disabled:true`, `active:false` 저장이다.
- 휴무 해제와 근무 clear는 삭제가 아니라 명시 값으로 남긴다.
- 표준입력은 공식 WorkSchedule 웹에서 `/workschedule_v2/overrides`, `status`에 직접 저장한다.
- 공통 해석 순서는 날짜별 `overrides` state=shift/off/clear -> `fixed_schedules/{empId}` fallback -> 미입력이다.
- 출근 원본 `/packhelper/storebot_attendance/{date}`는 수정하지 않고, 읽은 일자 데이터만 `/workschedule_v2/attendance_history/{date}`에 idempotent PUT으로 보존한다.
- StoreBotTermux 근무표 브리핑은 WorkSchedule 데이터를 소비하지만, 원본 근무 데이터 저장 경계는 WorkSchedule/Firebase가 가진다.
- HynixOps는 발주/근무표 탭형 통합 런처 이름이며, OrderHelper와 WorkSchedule 원본 SOT는 합치지 않는다.
- 날씨 기준 지역은 `이천시 부발읍`, 좌표 상수는 근사 `37.2816, 127.4892`다.
- `이원규(emp1)` 고정근무 fallback은 매일 `17:00~06:00`으로 해석한다.
- 타임바/리스트 게이지는 06시 day-boundary 기준 선택 근무일의 당일 근무자 첫 출근~마지막 퇴근 범위만 쓴다.
- 정적 프론트 인증은 `PIN 통과 AND (CLI 허용 단말 OR 서버/호스팅 허용 IP OR 매장 GPS 150m)` 구조다. 웹 화면에서 PIN+GPS로 단말을 자동 허용하지 않는다.
- IP allowlist는 CLI 기록/서버·호스팅 앞단 적용용이다. 정적 클라이언트의 임의 IP/X-Forwarded-For 값은 신뢰하지 않는다.

## UI/동선 기준
- WorkSchedule 웹은 Firebase DB 상세 확인/보정/출력 화면이다.
- HynixOps 근무표 조정은 safe queue 중심의 간단 입력 front이고, WorkSchedule 원본과 경계를 섞지 않는다.
- 운영탭은 하이닉스 메모/운영 기준을 정리된 메뉴얼로 보여준다. 메모 원문은 기본 화면에 복사 노출하지 않는다.
- 운영메뉴얼 구현 위치는 `docs/manual_logic.js`와 `docs/app.js` 운영탭이다. 하이닉스 메모탭/운영메뉴얼 소비자는 `/root/my-first-project/AttendanceBoard/docs/hynix/index.html`이고, durable source는 `/packhelper/ops_manual` read-only다.
- 기능 축소/숨김보다 근무표 입력과 상태 판별을 우선한다.
- 스와이프는 날짜 변경이며 탭 전환으로 바꾸지 않는다.
- 직원 공개 화면과 관리자 조작 화면의 경계를 섞지 않는다.

## 근무표 전달 품질 기준
- 근무표 전달은 원본 해상도에 가까운 PNG 이미지 출력을 기준으로 한다.
- 카톡 자동 선택/자동 발송은 하지 않는다. 사용자가 출력된 이미지와 대상 방을 직접 확인한다.
- 텍스트-only, 스크린샷 리사이즈, 압축 전송으로 대체하지 않는다.
- 전체 카톡 이미지 출력이 no-op이면 복구하거나 명확한 비활성 상태로 표시한다.
- 근무표 수정/갱신 후 5분간 추가 변경이 없을 때만 종합 이미지 출력 준비 상태로 본다.
- 마지막 이미지 출력 intent 큐잉 후 6시간이 지나면 최신 근무표 기준으로 다시 준비한다.
- 날씨/뉴스 보조정보가 누락되면 CLI 보정 lane 후보(`workschedule_delivery_cli_patch`)만 no-live/no-write로 만들고, 실제 외부 호출/발송은 별도 gate를 통과해야 한다.

## 데이터/경계 기준
- 주요 경로는 `/workschedule_v2/employees`, `fixed_schedules`, `overrides`, `status`, `attendance_history`다.
- MCP/브라우저 검증의 DB 증거는 `/workschedule_v2`, `/packhelper/ops_manual` 등 필요한 Firebase read source를 읽기 전용으로 확인한다.
- 스키마 계약과 read-only 점검은 `/root/my-first-project/rules/workschedule_schema_contract.txt`와 `scripts/workschedule_schema_audit.py`를 기준으로 한다.
- Firebase 쓰기 실패를 localStorage 단일 원본처럼 숨기지 않는다. 실패는 화면에서 알리고 재시도 가능해야 한다.
- StoreBotTermux/근무표 PNG 경로를 바꿀 때는 StoreBotTermux와 `.agents/skills/storebot-kakao-reply` 기준을 같이 확인한다.

## C&I / AI Ops 경계
- C&I는 GitHub Pages 배포 실패, JS 오류, Firebase sync 불일치, StoreBotTermux 근무표 소비 오류, 반복 사용자 보정 신호를 self_fix 후보로 올린다.
- 자동 복구는 웹 코드/문서/배포 보정과 검증까지 허용한다.
- 직원/근무 원본 임의 삭제, 직원 공개 화면 쓰기 기능 혼입, 카톡 실제 발송은 금지한다.
- CLI/LLM은 prompt envelope가 있어야 깨어난다. monitor/worker/사용자/수동 enqueue 또는 상주 판단 루프가 prompt를 주입한다.

## 수정 전 질문
- 이 변경이 Firebase 원본 근무표 입력/조회 실수를 줄이는가.
- 하이닉스 사이트 출력과 카톡 PNG 이미지 출력이 같은 기준을 보는가.
- StoreBotTermux 근무표 출력과 공식 URL 안내가 같이 맞는가.

## 완료 기준
- 검증: JS syntax, 순수 로직 테스트, Firebase read-only 증거, Playwright desktop/mobile screenshot + DOM smoke, Axe critical/serious 0 또는 사유.
- 전달: static deploy/browser evidence가 필요한 경우 GitHub Pages 반영 확인 gate를 통과한다.
- Figma: 실제 file/source가 있을 때만 기준으로 쓴다.
- 제외: Android Gradle 빌드, APK 설치, ADB 검증, 업데이트센터 배포.
- 남은 위험: 브라우저 캐시, Firebase 일시 실패, 직원 공개 화면 혼동, 카톡 대상 방 수동 선택 실수.
