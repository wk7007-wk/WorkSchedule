# WorkSchedule 공장 PC USB 설치 큐

- 기록 시각: 2026-07-02 17:54 KST
- 목적: 서버폰에 최신 WorkSchedule debug APK를 공장 PC Codex가 USB ADB로 직접 설치한다.
- 현재 세션 blocked 사유: 서버폰 USB가 이 환경이 아니라 공장 PC에 연결되어 있어 여기서 설치를 시도하지 않는다.

## 기준
- 최신 APK: `/root/WorkSchedule/app/build/outputs/apk/debug/app-debug.apk`
- 최신 기능 커밋: `e895ff9d41d23c2aa3731e94c700cf024928770b` (`e895ff9 근무표 자동 이미지 발송 기준 반영`)
- 관련 규칙 커밋: `b626cc7419d61ffe17b94f423a8102b31d74361d` (`b626cc7 근무표 공유 품질 기준 기록`)
- 서버폰 설치는 공장 PC Codex에서 USB ADB로 수행한다.
- USB가 1순위다. 공장 PC는 먼저 `adb devices -l`에서 USB `device` serial을 확인한다.

## 공장 PC 실행 명령
```bash
cd /root/WorkSchedule
git status --short
ls -l app/build/outputs/apk/debug/app-debug.apk
adb devices -l
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell dumpsys package com.workschedule.app | grep -E 'versionName|versionCode|lastUpdateTime'
```

## 금지
- `uninstall`, app data reset, 데이터 삭제 금지
- 무선 stale endpoint 반복 재시도 금지
- 카카오 발송 금지
- 설치 후 앱 실행은 별도 승인 후에만 수행
