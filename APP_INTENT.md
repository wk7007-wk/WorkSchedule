# WorkSchedule APP_INTENT.md

## 만든 이유
- 매장 근무표, 휴무, 출근기록을 Firebase DB 한 기준으로 관리하고, 하이닉스 사이트와 카톡 이미지 출력에 같은 근무표를 쓰게 한다.

## 사용자 결과
- WorkSchedule은 Android APK/설치형 앱이 아니다.
- surface_type은 `site/static-web` 또는 `docs web`이다.
- 공식 웹 출력은 `docs/` GitHub Pages `https://wk7007-wk.github.io/WorkSchedule/`다.
- 하이닉스 사이트/HynixOps, StoreBotTermux, 대시보드는 Firebase `/workschedule_v2`를 소비한다.
- `/packhelper/storebot_summary/schedule`은 표시용 캐시일 뿐 canonical 근무표 근거가 아니다.
- 하이닉스 근무표의 향후 Google 연동은 BankTotal 개인계정과 다른 새 Google 계정, 별도 OAuth client/project/config, 별도 token/Calendar/syncToken 저장소를 사용한다. 현재는 미구현·미연결 상태이며 `/workschedule_v2`가 계속 canonical이다.
- 카톡 전달은 최신 근무표 PNG 이미지를 웹 공유 메뉴 또는 다운로드 파일로 출력한다.
- 카톡 이미지 근무 확인은 preview queue 항목을 사람이 확인한 뒤 backend confirmed request queue로만 넘긴다.

## 절대 기준
- Firebase `/workschedule_v2`가 단일 근무 데이터 원본이다.
- 운영메뉴얼 durable source는 Firebase `/packhelper/ops_manual`이다. WorkSchedule/HynixOps는 원본 항목을 읽기 전용으로 합산하고, 사이트 입력은 `/packhelper/ops_manual/candidates/{id}` 후보 큐에만 등록한다. `localStorage`는 인증 토큰, UI 상태, 실패 시 임시 보관 백업, 이미지 출력 due 상태 같은 브라우저 보조 상태만 맡는다.
- `/packhelper/ops_manual`가 비어도 직원용 운영메뉴얼 필수 항목(배민/쿠팡/BBQ앱/BBQ쿠폰 안내)은 공개 seed fallback으로 보여야 한다.
- 메모추가 통합 입력은 텍스트, URL, 이미지(붙여넣기/드래그/업로드), 카카오 대화, CLI, 타이머앱, 사이트 입력을 즉시 envelope로 바꾸고, 분류 후보(운영메뉴얼/레시피/배달정보/할일/할인행사/근무표/뉴스/날씨/규정)를 같이 보여준 뒤 후보 큐에서 리소스/모델/MCP 필요 여부/카테고리/태그/반영 방식을 판단하게 한다.
- 직원 삭제는 노드 삭제가 아니라 `disabled:true`, `active:false` 저장이다.
- 휴무 해제와 근무 clear는 삭제가 아니라 명시 값으로 남긴다.
- 상단 표준입력은 preview/testAuth/readonly에서 확인 큐용 request object를 만들고, 실제 인증 모드에서는 `/workschedule_v2/overrides`, `status`에 직접 적용한다.
- 카톡 이미지 근무 확인 panel은 `/workschedule_v2`에 직접 저장하지 않는다. preview queue를 읽고, 확인 시 `/packhelper/storebot_termux/confirmed_schedule_write_requests`에 `confirmed_schedule_write_request`를 enqueue한다.
- 브리핑 탭은 일정, 알람, 할인/행사, 뉴스, 날씨, 근무, 오늘 필요한 메뉴얼을 함께 요약하고, 사이트 상세/카카오 요약/근무표 이미지 출력 기준을 짧게 보여준다.
- 브리핑 탭은 데이터가 없어도 섹션과 대기/빈 상태를 보여야 하며, 일정/할일/알람/예약/할인행사/뉴스/날씨/근무/오늘 필요한 메뉴얼을 함께 요약한다.
- confirmed request live 실행 의도는 `dry_run=false`와 `execute_live_write=true`가 동시에 있을 때만 보낸다. 기본은 dry-run 확인 요청이다.
- 공통 해석 순서는 날짜별 `overrides` state=shift/off/clear -> `fixed_schedules/{empId}` fallback -> 미입력이며, `clear`는 해당 날짜의 fixed fallback을 막는다.
- 출근/퇴근/실근태 원본은 `/workschedule_v2/attendance/{date}/{empId}`이며 계획 근무(`fixed_schedules`, `overrides`, `status`)와 분리한다.
- StoreBotTermux 근무표 브리핑은 WorkSchedule 데이터를 소비하지만, 원본 근무 데이터 저장 경계는 WorkSchedule/Firebase가 가진다.
- HynixOps는 발주/근무표 탭형 통합 런처 이름이며, OrderHelper와 WorkSchedule 원본 SOT는 합치지 않는다.
- 날씨 기준 지역은 `이천시 부발읍`, 좌표 상수는 근사 `37.2816, 127.4892`다.
- 직원별 고정근무는 `/workschedule_v2/fixed_schedules`에 있는 값만 해석한다. 코드/화면의 직원별 하드코딩 fallback은 금지한다.
- 타임바/리스트 게이지는 06시 day-boundary 기준 선택 근무일의 당일 근무자 첫 출근~마지막 퇴근 범위만 쓴다.
- 정적 프론트 인증은 `PIN 통과 AND (CLI 허용 단말 OR 서버/호스팅 허용 IP OR 매장 GPS 150m)` 구조다. 웹 화면에서 PIN+GPS로 단말을 자동 허용하지 않는다.
- 인증 화면은 PIN, 매장 좌표/반경, 단말 저장 상태를 한글로 보여주고, PIN 값은 화면에 노출하지 않는다.
- IP allowlist는 CLI 기록/서버·호스팅 앞단 적용용이다. 정적 클라이언트의 임의 IP/X-Forwarded-For 값은 신뢰하지 않는다.

## UI/동선 기준
- WorkSchedule 웹은 Firebase DB 상세 확인/보정/출력 화면이다.
- HynixOps 근무표 조정은 safe queue 중심의 간단 입력 front이고, WorkSchedule 원본과 경계를 섞지 않는다.
- 모바일에서는 보조 패널을 기본적으로 접어 스크롤을 줄이고, 날짜/인원/월별/리스트 탭과 하단 시트를 중심으로 본다.
- 근무 수정은 날짜/직원 선택 후 하단 시트의 휴무/시간 프리셋으로 2~3터치 안에 마치는 흐름을 우선한다.
- 운영탭은 하이닉스 메모/운영 기준을 직원용 메뉴얼로 보여준다. 제목, 요약, 해야 할 일, 주의만 기본 노출하고 source/id/search_text/sourceTypes/updated_at 같은 메타는 내부에만 둔다.
- 운영메뉴얼 카드는 제목 나열보다 본문, 체크리스트, 주의가 먼저 읽히는 구조를 유지한다.
- 근무 직접 수정은 직원/날짜를 고른 뒤 확인-저장 흐름으로 `/workschedule_v2` 원천을 직접 갱신한다. 카톡 PNG 출력과 같은 원천을 본다.
- 운영메뉴얼 구현 위치는 `docs/manual_logic.js`와 `docs/app.js` 운영탭이다. 하이닉스 메모탭/운영메뉴얼 소비자는 `/root/my-first-project/AttendanceBoard/docs/hynix/index.html`이고, durable source는 `/packhelper/ops_manual` read-only다. 사이트 입력은 `/packhelper/ops_manual/candidates/{id}` 후보 큐만 쓴다.
- 운영메뉴얼은 원문 복사본이 아니라 분석/편입된 색인형 DB로 유지한다. 카카오봇 상황 답변용 검색 키와 태그는 `docs/manual_logic.js` 계약을 따른다.
- 기능 축소/숨김보다 근무표 입력과 상태 판별을 우선한다.
- 스와이프는 날짜 변경이며 탭 전환으로 바꾸지 않는다.
- 직원 공개 화면과 관리자 조작 화면의 경계를 섞지 않는다.
- 카톡 이미지 근무 확인은 기존 표준입력/근무 수정 UI와 별도 panel로 둔다. 사용자가 preview item을 선택해 `date/employee/action/shift/off/clear`를 보정하고 확인/반려/보류한다.

## 근무표 전달 품질 기준
- 근무표 전달은 원본 해상도에 가까운 PNG 이미지 출력을 기준으로 한다.
- 카톡 자동 선택/자동 발송은 하지 않는다. 사용자가 출력된 이미지와 대상 방을 직접 확인한다.
- 텍스트-only, 스크린샷 리사이즈, 압축 전송으로 대체하지 않는다.
- 전체 카톡 이미지 출력이 no-op이면 복구하거나 명확한 비활성 상태로 표시한다.
- 근무표 수정/갱신 후 5분간 추가 변경이 없을 때만 종합 이미지 출력 준비 상태로 본다.
- 마지막 이미지 출력 intent 큐잉 후 6시간이 지나면 최신 근무표 기준으로 다시 준비한다.
- 날씨/뉴스 보조정보가 누락되면 CLI 보정 lane 후보(`workschedule_delivery_cli_patch`)만 no-live/no-write로 만들고, 실제 외부 호출/발송은 별도 gate를 통과해야 한다.

## 데이터/경계 기준
- 주요 경로는 `/workschedule_v2/employees`, `fixed_schedules`, `overrides`, `status`, `attendance`다.
- 카톡 이미지 preview 확인 경로는 `/packhelper/storebot_termux/work_schedule_image_preview_queue/{event_id}` read + review metadata patch, `/packhelper/storebot_termux/confirmed_schedule_write_requests/{request_id}` enqueue다.
- MCP/브라우저 검증의 DB 증거는 `/workschedule_v2`, `/packhelper/ops_manual` 등 필요한 Firebase read source를 읽기 전용으로 확인한다.
- 스키마 계약과 read-only 점검은 `/root/my-first-project/rules/workschedule_schema_contract.txt`와 `scripts/workschedule_schema_audit.py`를 기준으로 한다.
- Firebase 쓰기 실패를 localStorage 단일 원본처럼 숨기지 않는다. 운영메뉴얼 후보 등록 실패는 임시 보관 백업으로 분리해 화면에 짧게 알리고 재시도 가능해야 한다.
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
- 검증: JS syntax, 순수 로직 테스트, confirmation panel static write-boundary test, Firebase read-only 증거, Playwright desktop/mobile screenshot + DOM smoke, Axe critical/serious 0 또는 사유.
- 전달: static deploy/browser evidence가 필요한 경우 GitHub Pages 반영 확인 gate를 통과한다.
- Figma: 실제 file/source가 있을 때만 기준으로 쓴다.
- 제외: Android Gradle 빌드, APK 설치, ADB 검증, 업데이트센터 배포.
- 남은 위험: 브라우저 캐시, Firebase 일시 실패, 직원 공개 화면 혼동, 카톡 대상 방 수동 선택 실수.
