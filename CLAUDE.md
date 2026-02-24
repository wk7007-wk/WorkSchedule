# WorkSchedule 프로젝트 규칙

## 앱 개요
매장 직원(5~10명) 근무표 작성/공유 앱. 타임라인 게이지 + AI 스케줄링. WebView + GitHub Pages 구조.

## Firebase 구조
- **DB**: `poskds-4ba60-default-rtdb.asia-southeast1.firebasedatabase.app`
- 직원: `/workschedule/employees.json`
- 스케줄: `/workschedule/schedules/{yyyy-MM-dd}.json`
- 설정: `/workschedule/settings.json`
- **Gemini 키**: `/banktotal/settings/gemini_key.json` (BankTotal 공유)

## 웹 대시보드
- GitHub Pages: `https://wk7007-wk.github.io/WorkSchedule/`
- 파일: `/root/WorkSchedule/docs/index.html`
- 웹 변경 시 push만 (APK 재빌드 불필요)

## UI 구조 (순서)
1. **헤더**: 날짜 표시 + ◀▶ + 직원관리 + 월간보기
2. **타임라인 게이지**: 06:00~03:00, 직원별 근무바 + 인원수 + 역할 요약
3. **주간 개요**: 7일 그리드 + 휴일 수 표시
4. **정보**: 날씨(이천시) + 경기일정(KBO/챔스/국대) + 물류인원 체크
5. **AI 스케줄링**: Gemini 채팅으로 자동 배치
6. **공유**: 이미지 캡처 + 텍스트 + URL 복사 + .ics 캘린더

## 직원 목록 (기본)
이원규, 권연옥, 리, 히오, 박준모, 전묘정, 대유

## 인원 규칙
- 10:00~16:00: 최소 2명
- 16:00~03:00: 최소 3명 (배달 포함)
- 물류: 16:30 이후 인원 체크

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
- 역할/시급 상세 (유저 입력 대기)
- 월급 계산 + BankTotal 연동
- 카카오톡 이미지 공유 (NativeBridge 필요)
- 자동 스케줄링 고도화 (선호시간/불가시간 반영)
