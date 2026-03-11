# WorkSchedule 규칙

## 개요
매장 직원(7명) 근무표 앱. WebView + GitHub Pages. 타임라인 게이지 + AI 스케줄링.
상세 스펙: SPEC.txt

## 데이터 저장 (최우선)
- localStorage = Single Source of Truth (Firebase = 백업/동기화)
- 모든 저장: localStorage 먼저 → Firebase 백그라운드
- 모든 로드: localStorage 즉시 렌더 → Firebase 병합 (로컬 우선)
- clearCache 금지 (localStorage 전부 삭제됨)
- Firebase 실패해도 로컬 유지

## 직원 + 고정 스케줄
- 직원: 이원규, 권연옥, 리, 히오, 박준모, 전묘정, 대유
- 역할 3종: 주방(#E67E22) / 차배달(#4ECDC4) / 오토바이(#FFD700)
- 멀티역할: 동시 체크 시 각 0.5명 계산
- 고정스케줄: SPEC.txt "고정 스케줄" 섹션 참조

## 보정 시스템
- 보정(auto) → 확정(confirmed) → 미정(pending)
- 수동 저장 시 자동 confirmed 전환
- 확정 2회 이상 → AI추천 표시

## 핵심 규칙
- renderAll() 경유 필수 (renderTimeline 직접 호출 금지)
- 3색 상수: C_OK=#2ECC71, C_DEF=#9090A8, C_OFF=#E74C3C
- 반드시 전역 스코프 선언 (함수 내부 X)
- 휴무 해제: dayoffs[empId][dk] = false (delete 아님)
- 스와이프 = 날짜 변경 (탭 전환 아님)
- 기능 축소/숨김 금지 (display:none X)
- 이모지/그림 아이콘 지양 → 색상 텍스트

## 구조
- 파일: /root/WorkSchedule/docs/index.html (단일)
- Pages: https://wk7007-wk.github.io/WorkSchedule/
- init_ver: v7 (캐시 초기화 버전)
- Firebase: /workschedule/ (employees, schedules, dayoffs, confirmed, settings)
- Gemini 키: /banktotal/settings/gemini_key.json (BankTotal 공유)

## 배포
- 웹 변경: push만 (APK 불필요)
- APK 변경: 공통규칙 Android 배포 절차

## 완료
- 월급 계산 + BankTotal 연동
- 자동 스케줄링 고도화

## 미완료
- 카카오톡 이미지 공유 (NativeBridge 필요)
