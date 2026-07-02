# WorkSchedule 공장 PC USB 설치 큐

- 기록 시각: 2026-07-02 17:56 KST
- 목적: 서버폰에 최신 WorkSchedule debug APK를 공장 PC Codex/작업자가 USB ADB로 직접 설치/검증하도록 요청을 남긴다.
- 이번 큐 기록: APK 산출물 위치와 설치 요청만 남긴다. 현재 임의 실행 환경의 ADB 목록 결과로 서버폰 연결 상태를 판정하지 않는다.
- 판정 기준: 서버폰 연결/설치 가능 여부는 USB가 실제 연결된 공장 PC Codex/작업자가 그 자리에서 확인한다.

## 기준
- 최신 APK: `/root/WorkSchedule/app/build/outputs/apk/debug/app-debug.apk`
- APK 확인: 5,623,461 bytes, 2026-07-02 17:41 KST 빌드 산출물
- 최신 기능 커밋: `e895ff9d41d23c2aa3731e94c700cf024928770b` (`e895ff9 근무표 자동 이미지 발송 기준 반영`)
- 관련 규칙 커밋: `b626cc7419d61ffe17b94f423a8102b31d74361d` (`b626cc7 근무표 공유 품질 기준 기록`)
- 이 문서는 공장 PC에 서버폰 설치 요청을 남기는 큐다. 서버폰 미연결 판정 문서가 아니다.
- 서버폰 설치와 연결 판정은 USB가 실제 물린 공장 PC Codex/작업자만 수행한다.
- 비공장/불확실 호스트에서는 ADB 목록, 설치, dumpsys, 무선 연결 같은 장치 명령을 실행하지 않고 큐/요청만 남긴다.
- USB가 1순위다. 공장 PC는 먼저 USB `device` serial을 확인한다.
- USB `device` 상태가 확인되기 전에는 `adb install -r`와 `dumpsys package` 검증을 진행하지 않는다.

## 공장 PC 전용 확인 항목
```bash
cd /root/WorkSchedule
git status --short
ls -l app/build/outputs/apk/debug/app-debug.apk
adb devices -l
# USB device 상태일 때만:
# adb install -r app/build/outputs/apk/debug/app-debug.apk
# adb shell dumpsys package com.workschedule.app | grep -E 'versionName|versionCode|lastUpdateTime'
```

## 금지
- `uninstall`, app data reset, 데이터 삭제 금지
- 무선 stale endpoint 반복 재시도 금지
- 카카오 발송 금지
- 설치 후 앱 실행은 별도 승인 후에만 수행
