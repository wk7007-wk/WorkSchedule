# WorkSchedule 슬림 재작성 — 설계 인수인계 (Claude → Codex)

## 0. 배턴 상황
- Claude가 **1차 진단**까지 수행. 구현은 아직 시작 안 함.
- Codex가 **§4 설계 논점 결정 완료**. Claude가 이 결정안 기준으로 코딩하고, Codex가 구현 후 재검토.
- 인수인계 md 경로: `/root/WorkSchedule/REFACTOR_HANDOFF.md` (이 파일)
- 원본 플랜: `/root/.claude/plans/virtual-conjuring-turtle.md`
- 방금 dayTimes 오버라이드 기능이 라이브 반영됨 (커밋 `578f41b`). 이 이후로 스키마 동결.
- `CODEMAP.txt`는 예전 단일 HTML 기준 내용이 남아 있음. 구현 완료 후 현재 분리 구조 기준으로 갱신 필요.

## 1. Context (왜 재작성)
`/root/WorkSchedule/docs/` 웹앱은 직원 5명 근무표인데 `app.js` 1,560줄 + `index.html` 234줄 + `style.css` 376줄 = **2,170줄**. 0408 리팩터링 때 기능만 뺐고 DOM·no-op 코드가 잔존. 단순 근무표 기준으로 과비대. **합계 700줄 이하**로 슬림 재작성.

## 2. Claude 가 파악한 현황 (Codex 가 참고)

### 필수 기능 (보존 대상)
- 타임바 뷰 + 리스트 뷰 (탭 2개)
- Shift 편집 모달 (시간 select + 게이지 드래그 + 빠른선택 + 역할 + 고정값저장 + 휴무토글)
- 당일 브리핑 카드 (4칸, 공휴일 배지)
- 날짜 스트립 + 날짜 선택기
- 주간 개요 collapsible
- 직원 관리 / 휴무 일괄등록 (텍스트 파싱)
- 자동배정(`autoApplyFixed`) + 자동휴무(`generateAutoDayoffs`)
- SSE 실시간 동기화 + 확정 토글 / 전체확정
- `/packhelper/storebot_attendance` 실제 근태 오버레이
- 텍스트/URL 공유 + 터치 스와이프 날짜 이동

### 재사용할 순수함수 (app.js 라인)
- 89~97: pad / dateStr / dateKey / isSameDay / getMonday
- 99~121: timeToMinutesFrom12 / calcHours / timeToPercent / parseTimeMin
- 62~65: getHolidayName / isKrHoliday / isWeekend
- 163~180: fbGet / fbPut / fbPatch / fbDelete
- 186~267: connectSSE / connectScheduleSSE
- **273~296: getFixedScheduleForDate** ← dayTimes 포함, 그대로 포팅 필수
- 396~465: autoApplyFixed / generateAutoDayoffs
- 470~496: categorizeEmployees

### 제거 후보 (죽은 코드)
- `#resetFixedBtn`, `#confirmDayBtn` 숨김 DOM
- `resetToFixed()`, `getDayOffEmployees()` 미사용 함수
- 월간 모달(`renderMonthView`) — 날짜선택기로 대체 가능
- `attSrcBadge` 내 gemini/AI 출처 코드
- 0408 이후 잔존한 매출/AI/날씨/ICS/급여/드래그생성 흔적

## 3. 확정된 제약 (변경 금지)
1. Firebase 스키마 동결 (경로·키·`dayTimes` 구조 포함)
2. 바닐라 JS 유지 (React/Vue 등 금지)
3. 유료 서비스 도입 금지
4. Firebase 데이터 **삭제 금지** (PATCH만)
5. GitHub Pages 정적 배포 유지

### Firebase 경로 (전부 유지)
```
/workschedule/employees/{empId}
/workschedule/schedules/{yyyy-MM-dd}/{empId}
/workschedule/fixed_schedules/{한글이름}     ← encodeURIComponent
/workschedule/dayoffs/{empId}/{yyyy-MM-dd}
/workschedule/confirmed/{yyyy-MM-dd}
/workschedule/shift_status/{yyyy-MM-dd}/{empId}
/packhelper/storebot_attendance/{yyyy-MM-dd}   ← 읽기 전용
```

## 4. Codex 설계 결정안 (Claude 구현 기준)

### 4.1 파일 구조
- **결정**: `docs/app.js` 단일 IIFE 유지. `utils.js`/`render.js`/`firebase.js` 모듈 분할 금지.
- **이유**: GitHub Pages는 모듈을 지원하지만 Android WebView/file asset 로딩에서 import 경로 문제가 생길 수 있음.
- **정리 방식**: app.js 내부 순서만 `config → store → api → selectors → render → actions → init`로 재배치.

### 4.2 뷰 렌더링
- **결정**: 타임바/리스트 렌더러는 분리 유지.
- **공통화 범위**: `buildDayModel()`, `renderStatusSummary()`, `renderAttendanceLine()`, `renderEmptyRows()`, `renderOffRows()` 정도만 공통화.
- **금지**: `renderView(mode)` 하나로 과도하게 합쳐서 mode 조건문이 커지는 구조.

### 4.3 SSE 재연결
- **결정**: `EventSource.close()` + 세대관리 방식 유지. `AbortController` 전환 금지.
- **개선**: employees/schedule/attendance 구독을 작은 `SseHub` 또는 동등한 내부 객체로 묶고, 재연결은 3초→10초→30초 단순 backoff.
- **주의**: 날짜 변경 시 이전 schedule SSE 이벤트가 새 날짜 상태를 덮지 않도록 세대/날짜 토큰 유지.

### 4.4 상태 저장소
- **결정**: 흩어진 전역 `let`을 단일 `store` 객체로 통합.
- **예상 필드**: `date`, `tab`, `employees`, `schedule`, `weekSchedules`, `fixed`, `dayoffs`, `confirmed`, `status`, `attendance`, `loaded`, `sse`.
- **금지**: Redux식 action/reducer 같은 과한 추상화. `resetDayState()`, `setDate()`, `dayKey()` 같은 얇은 함수만 허용.

### 4.5 월간 뷰
- **결정**: 제거 확정.
- **삭제 대상**: `monthModal`, `renderMonthView()`, `monthPrev/monthNext/monthModalClose` 이벤트, month CSS.
- **대체**: 현재 날짜 스트립 + 30일 날짜 선택기 유지.

### 4.6 공휴일 데이터
- **결정**: 2026~2027 하드코딩 유지. 공공 API 런타임 fetch 금지.
- **이유**: 서비스키/CORS/네트워크 장애 의존성이 생김. WorkSchedule 용도는 배지/색상/고정스케줄 분기라 로컬 테이블이 안정적.
- **개선**: `Set + names object` 이중 구조 대신 `{ 'yyyy-MM-dd': '공휴일명' }` 단일 맵으로 축소 가능.

### 4.7 오프라인/캐시
- **결정**: Firebase 단일소스 유지. localStorage SoT 복귀 금지.
- **UX**: SSE 끊김 시 마지막 화면 유지 + 연결 상태만 표시. 오프라인 쓰기 큐는 만들지 않음.
- **저장 정책**: 오프라인/저장 실패 시 화면에는 낙관 반영하더라도 실패 토스트와 재시도 동선이 필요함. 숨은 큐로 나중에 자동 저장하지 말 것.
- **복귀 처리**: `visibilitychange` 시 `connectSSE()` + `loadData()` 재호출. `location.reload()` 남발 금지.

### 4.8 Firebase 쓰기/삭제 정책
- **결정**: `fbDelete()` 제거. Firebase 쓰기는 `PUT`/`PATCH`만 사용.
- **이유**: 공용 규칙상 Firebase 데이터 삭제 금지. 기존 코드의 `DELETE` 래퍼는 재작성에서 없앤다.
- **주의**: RTDB에서 특정 값을 지워야 하는 기존 동작은 parent `PATCH`로 `null`을 보내는 방식으로만 처리하고, 실제 데이터 삭제성 변경은 최소화한다.

## 5. 타깃 규모
| 파일 | 현재 | 목표 |
|------|------|------|
| app.js | 1,560 | ≤ 450 |
| index.html | 234 | ≤ 100 |
| style.css | 376 | ≤ 220 |
| **합계** | **2,170** | **≤ 770** |

## 6. Claude 구현 진행 순서
1. 이 문서와 `/root/WorkSchedule/CLAUDE.md` 확인.
2. `/tmp/claude_user_intent.txt`에 사용자 의도 기록 후 코딩 시작.
3. `/root/WorkSchedule/docs/index.html`, `docs/app.js`, `docs/style.css`를 §4 결정안 기준으로 슬림 재작성.
4. `CODEMAP.txt`를 현재 분리형 구조와 새 함수 배치 기준으로 갱신.
5. 로컬 서빙 스모크 테스트 후 §7 체크리스트 수행.
6. 중간 배포 없이 1회 완결 배포. GitHub Pages 정적 배포 유지.
7. Claude 구현 완료 후 Codex가 재검토할 수 있게 변경 요약/검증 결과를 이 문서 또는 `AI_HANDOFF.md`에 짧게 남김.

## 7. 검증 체크리스트 (구현 후)
- 타임바↔리스트 탭 전환, 날짜 ±1/±7 및 터치 스와이프
- Shift modal: 저장 / 삭제 / 휴무토글 / 고정값저장
- 직원 추가·수정·삭제
- 휴무 일괄등록 (요일+이번주 / 슬래시 / ISO 모두)
- 전체확정 + 자동배정 결과
- SSE 반영 (다른 클라이언트에서 수정 시)
- **dayTimes 회귀 확인**: 4/21(화) 리·히오 18-06, 4/24(금) 연옥 17-24
- 4/20~4/26 다음주 테이블이 현재 렌더링과 완전 동일
- Firebase 쓰기 경로가 기존 스키마와 동일한지 확인
- `fbDelete`/`DELETE` 사용이 남아 있지 않은지 확인
- 월간 뷰 DOM/JS/CSS가 제거됐고 날짜 선택기 동작이 유지되는지 확인

## 8. 참고 자료
- `/root/my-first-project/CLAUDE.md` — 공용 규칙 (코딩 전 intent 기록, code-guard 호출)
- `/root/my-first-project/AGENTS.md` — 에이전트 역할 분담
- `/root/.claude/projects/-root-my-first-project/memory/workschedule.md` — 앱 메모리
- 최근 커밋 `578f41b` — dayTimes 추가
- Firebase URL: `https://poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app`

## 9. 금지 사항 재확인
- 스키마 변경 금지 / Firebase 삭제 금지
- 프레임워크 도입 금지 / 유료 서비스 금지
- 중간 부분 배포 금지 (슬림 재작성은 **1회 완결 배포**)
