# WorkSchedule 공장 PC USB 설치 큐

- 기록 시각: 2026-07-02 17:56 KST
- 목적: 서버폰에 최신 WorkSchedule debug APK를 공장 PC Codex가 USB ADB로 직접 설치/검증한다.
- 이번 점검 결과: APK는 확인됐지만 `adb devices -l`에 USB `device` 행이 없어 설치하지 못했다.
- 실패 분류: USB device 없음. `adb get-state`도 `no devices/emulators found`라 패키지 오류나 앱 설치 오류 단계까지 가지 않았다.

## 기준
- 최신 APK: `/root/WorkSchedule/app/build/outputs/apk/debug/app-debug.apk`
- APK 확인: 5,623,461 bytes, 2026-07-02 17:41 KST 빌드 산출물
- 최신 기능 커밋: `e895ff9d41d23c2aa3731e94c700cf024928770b` (`e895ff9 근무표 자동 이미지 발송 기준 반영`)
- 관련 규칙 커밋: `b626cc7419d61ffe17b94f423a8102b31d74361d` (`b626cc7 근무표 공유 품질 기준 기록`)
- 서버폰 설치는 공장 PC Codex에서 USB ADB로 수행한다.
- USB가 1순위다. 공장 PC는 먼저 `adb devices -l`에서 USB `device` serial을 확인한다.
- USB `device` 상태가 확인되기 전에는 `adb install -r`와 `dumpsys package` 검증을 진행하지 않는다.

## 공장 PC 실행 명령
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
