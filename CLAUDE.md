# WorkSchedule 프로젝트 규칙

## 앱 개요
매장 직원(5~10명) 근무표 작성/공유 앱. 타임라인 게이지 + AI 스케줄링. WebView + GitHub Pages 구조.

## 데이터 저장 (최우선 규칙)
- **localStorage = Single Source of Truth** (Firebase = 백업/동기화)
- **모든 저장**: localStorage 먼저 → Firebase 백그라운드 동기화
- **모든 로드**: localStorage 즉시 렌더 → Firebase 나중에 병합
- **새로고침/오프라인 시 데이터 유실 절대 금지**
- **Firebase 실패해도 로컬 데이터 유지** → "로컬 저장됨" 토스트
- **Firebase → localStorage 덮어쓰기 금지**: 병합 시 로컬 우선
- **localStorage 키**: 직원=`ws_employees`, 스케줄=`ws_sched_{yyyy-MM-dd}`, 휴무=`ws_dayoffs`
- **clearCache 금지**: WebView clearCache(true) 사용 시 localStorage 전부 삭제됨

## 모니터링/편집 모드
- **기본 = 모니터링 모드 (🔒 잠금)**: 터치/드래그 비활성, 오작동 방지
- **편집 모드 (✏️)**: 헤더 🔒 버튼 탭으로 진입, 드래그/클릭 수정 가능, 초록 테두리 표시
- **자동 잠금**: 10분 무조작 시 자동으로 모니터링 모드 복귀
- **사진 공유 최적화**: 모니터링 모드에서 스크린샷 → 직원명+시간 명확히 보임

## UI/레이아웃 규칙
- **기능 축소/숨김 금지**: display:none으로 섹션 숨기지 말 것. 모든 기능 유지
- **타임라인**: 75vh 높이, 스크롤 내리면 나머지 섹션 접근 가능
- **헤더**: sticky top (스크롤해도 상단 고정)
- **시간 가독성**: 폰트 .7rem 이상, 색상 #9090A8 이상 밝기
- **body**: 자연스러운 스크롤 (overflow:hidden 금지)
- **시프트 블록**: 직원명(.75rem bold 흰색) + 시간 + 아이콘 + 시간수, 배경 55% 불투명 + 좌측 컬러바

## 역할 시스템
- **역할**: 주방(🍳), 배달(🛵) — 멀티 선택 가능
- **멀티 역할**: 주방+배달 동시 체크 시 각 역할 0.5명으로 계산
- **단일 역할**: 1.0명으로 계산
- **미지정**: 주방으로 카운트
- **저장 형식**: `role: "주방,배달"` (콤마 구분)

## 배달대행 (가상 멤버)
- **영업시간**: 10:00 ~ 01:00 (새벽 1시)
- **역할**: 배달자 공백 시간대에 자동으로 배달 파트 충족
- **표시**: 배달 인원 부족 + 배달대행 영업시간 내 → "대행"으로 표시
- **매시간 배달 필요**: 영업시간 내 매 시간 배달 인원 1명 이상 필요

## 고정 스케줄 (자동 입력)
- **이원규**: 10:00~20:00 주방+배달 (매일 고정, 오픈~저녁8시)
- **히오**: 18:00~03:00 주방+배달 (매일 고정)
- **리**: 18:00~03:00 주방+배달 (히오와 동일, 매일 고정)
- **박준모**: 17:00~03:00 주방+배달 (매일 고정, 휴무는 나중 지정)
- **전묘정**: 17:00~03:00 주방+배달 (매일 고정, 휴무는 나중 지정)
- **대유**: 변칙 — 수동 입력 (고정 스케줄 없음)
- **권연옥**: 미지정 (추후 확인)
- **자동 적용 조건**: 해당 날짜에 기존 입력이 없고, 휴무가 아닌 경우에만
- **기존 입력 보존**: 이미 입력된 스케줄은 절대 덮어쓰지 않음

## 당일 브리핑 패널
- 타임라인 위에 표시, 근무표 작성 시 염두사항 한눈에
- **내용**: 휴무예정자, 주간 휴무 누적(인당), 날씨/온도, 스포츠/매출변동요인, 근무현황(고정/수동/미입력), 대유 미입력 경고

## 인원 규칙 (시간대별 필요 인원)
- 매시간 주방 1명 + 배달 1명 필요
- 10:00~16:00: 최소 2명
- 16:00~03:00: 최소 3명 (배달 포함)
- 물류: 16:30 이후 인원 체크
- **충족 표시**: 초록(충족), 빨강(부족)

## 휴무 관리
- **휴무 버튼**: 헤더에 빨간 "휴무" 버튼
- **등록 방식**: 개별(직원+날짜) / 일괄 텍스트 입력
- **일괄 입력 형태** (파싱 지원):
  - `이원규 2/25, 2/26` — M/D 콤마
  - `권연옥 3/1~3/3` — 범위
  - `리 2025-03-05` — ISO
  - `히오 화,목` — 이번주 요일
- **타임라인 표시**: 휴무 직원 = 반투명 + 빨간 "휴무" 오버레이
- **Firebase**: `/workschedule/dayoffs/{empId}/{yyyy-MM-dd}`
- **localStorage**: `ws_dayoffs`

## Firebase 구조
- **DB**: `poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app`
- 직원: `/workschedule/employees.json`
- 스케줄: `/workschedule/schedules/{yyyy-MM-dd}.json`
- 휴무: `/workschedule/dayoffs/{empId}/{yyyy-MM-dd}.json`
- 설정: `/workschedule/settings.json`
- **Gemini 키**: `/banktotal/settings/gemini_key.json` (BankTotal 공유)

## 웹 대시보드
- GitHub Pages: `https://wk7007-wk.github.io/WorkSchedule/`
- 파일: `/root/WorkSchedule/docs/index.html`
- 웹 변경 시 push만 (APK 재빌드 불필요)

## UI 구조 (순서)
1. **헤더**: 날짜 표시 + ◀▶ + 직원관리 + 휴무관리 + 월간보기
2. **브리핑 패널**: 휴무자/주간누적/날씨/매출변동/근무현황 한눈에
3. **타임라인 게이지**: 06:00~03:00, 직원별 근무바 + 역할아이콘(🍳🛵) + 휴무표시
4. **합계행**: 직원별 시간 합계 / 휴무 표시
5. **인원 체크**: 시간대별 주방/배달 인원 충족 여부 (초록/빨강)
5. **주간 개요**: 7일 그리드 + 휴일 수 표시
6. **정보**: 날씨(이천시) + 경기일정(KBO/챔스/국대) + 물류인원 체크
7. **AI 스케줄링**: Gemini 채팅으로 자동 배치
8. **공유**: 이미지 캡처 + 텍스트 + URL 복사 + .ics 캘린더

## 직원 목록 (기본)
이원규, 권연옥, 리, 히오, 박준모, 전묘정, 대유

## 컬러 팔레트 (PosDelay 공유)
배경=#1A1A30→#121225, 카드=#242444→#1A1A35+테두리#2E2E52, 텍스트1=#E0E0EC, 텍스트2=#9090A8, 텍스트3=#707088, 배민=#2AC1BC, 쿠팡=#FFD700, ON=#2ECC71, OFF=#E74C3C, 중간=#E67E22, 수치=#FFFFFF

## Gemini API
- 모델: `gemini-2.0-flash`
- 키: BankTotal Firebase에서 로드 → localStorage 캐시
- 용도: 날씨, 경기일정, AI 스케줄링

## .ics 캘린더
- iPhone + Galaxy 호환
- 직원별 개별 다운로드 + 전체 다운로드
- TZID=Asia/Seoul, 야간 근무(03:00) 다음날 처리

## 빌드/배포
1. 빌드: `./gradlew assembleDebug`
2. APK 복사: `cp app/build/outputs/apk/debug/app-debug.apk /sdcard/Download/WorkSchedule.apk`
3. 설치: `termux-open /sdcard/Download/WorkSchedule.apk`
4. Git 커밋 + 푸시
5. GitHub Release: `gh release create "v${VER}" ... --repo wk7007-wk/WorkSchedule`

## 미완료
- 월급 계산 + BankTotal 연동
- 카카오톡 이미지 공유 (NativeBridge 필요)
- 자동 스케줄링 고도화 (선호시간/불가시간 반영)
