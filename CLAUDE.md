# WorkSchedule 규칙

## 개요
- Firebase DB 기반 근무표 웹/이미지 출력 도구다.
- Android APK/앱 wrapper는 사용하지 않는다.
- 상세 스펙: `SPEC.txt`

## 데이터 저장
- Firebase `/workschedule_v2`가 단일 근무 데이터 원본이다.
- 향후 Google 연동은 하이닉스 전용 새 계정과 별도 OAuth client/config/store를 사용한다. BankTotal 개인계정 token/Calendar ID/syncToken을 재사용하지 않으며, 현재는 미구현·미연결이다.
- `localStorage`는 인증 토큰, UI 상태, 운영메뉴얼 후보, 이미지 출력 due 상태만 보조로 쓴다.
- Firebase 실패를 로컬 원본처럼 숨기지 않는다.
- 출근/퇴근/실근태 원본은 `/workschedule_v2/attendance/{date}/{empId}`다.

## 직원 + 고정 스케줄
- 직원: 이원규, 권연옥, 리, 히오, 사아야
- 역할 3종: 주방(#E67E22) / 차배달(#4ECDC4) / 오토바이(#FFD700)
- 멀티역할: 동시 체크 시 각 0.5명 계산
- 고정스케줄: `SPEC.txt` "고정 스케줄" 섹션 참조

## 핵심 규칙
- `renderAll()` 경유 필수.
- 휴무 해제: `overrides/{date}/{empId}` state=clear 또는 명시 clear 값. 삭제 아님.
- 직원 삭제: `employees/{empId}`에 `disabled:true`, `active:false` 저장. 노드 삭제 아님.
- 스와이프 = 날짜 변경. 탭 전환 아님.
- 기능 축소/숨김보다 근무표 입력과 상태 판별을 우선한다.

## 구조
- 웹 파일: `docs/index.html`, `docs/style.css`, `docs/app.js`
- 순수 로직: `docs/schedule_delivery_logic.js`, `docs/manual_logic.js`
- Pages: `https://wk7007-wk.github.io/WorkSchedule/`
- Firebase: `/workschedule_v2/` employees, fixed_schedules, overrides, status, attendance
- 하이닉스 소비자: `/root/my-first-project/AttendanceBoard/docs/hynix/index.html`

## 출력
- 하이닉스 사이트와 WorkSchedule 웹은 Firebase DB를 읽어 화면을 만든다.
- 카톡 전달용 근무표는 `docs/app.js`에서 PNG로 생성한다.
- 웹 공유 메뉴 또는 PNG 다운로드만 수행한다.
- 카카오 자동 선택/자동 발송은 하지 않는다.

## 배포/검증
- 웹 변경: JS syntax/test와 브라우저 smoke 후 GitHub Pages 반영 여부를 본다.
- MCP surface는 `site/static-web`/`docs web`이다.
- DB 증거는 `/workschedule_v2`, `/packhelper/ops_manual` 등 필요한 Firebase read source만 읽기 전용으로 확인한다.
- 완료 증거는 Playwright desktop/mobile, Axe, static deploy/browser evidence 기준이다.
- Figma는 실제 file/source가 있을 때만 기준으로 쓴다.
- APK 빌드, 설치, ADB 검증, 업데이트센터 배포는 WorkSchedule 완료 기준이 아니다.

## 미완료/주의
- 카톡 대상 방 확인은 사용자 수동 gate다.
- 날씨/뉴스 보조정보 누락 시 `workschedule_delivery_cli_patch` 후보만 만들고 실제 외부 호출/발송은 하지 않는다.
