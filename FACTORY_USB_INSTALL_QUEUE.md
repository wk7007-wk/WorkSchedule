# WorkSchedule 공장 PC USB 설치 큐

- 기록 시각: 2026-07-02 19:04 KST
- 목적: 서버폰에 최신 WorkSchedule debug APK를 공장 PC Codex/작업자가 USB ADB로 직접 설치/검증하도록 요청을 남긴다.
- 이번 큐 기록: APK 산출물 위치와 설치 요청만 남긴다. 현재 임의 실행 환경의 ADB 목록 결과로 서버폰 연결 상태를 판정하지 않는다.
- 판정 기준: 서버폰 연결/설치 가능 여부는 USB가 실제 연결된 공장 PC Codex/작업자가 그 자리에서 확인한다.

## 기준
- 최신 APK: `/root/WorkSchedule/app/build/outputs/apk/debug/app-debug.apk`
- APK 확인: 5,631,281 bytes, 2026-07-02 18:40 KST 빌드 산출물
- APK 버전: `versionName=0702.1839`, `versionCode=1782985171`
- 최신 기능 커밋: `하이닉스 운영메뉴얼 탭 정리` 커밋 (`git log -1 --oneline` 기준)
- 관련 규칙 커밋: `b626cc7419d61ffe17b94f423a8102b31d74361d` (`b626cc7 근무표 공유 품질 기준 기록`)
- 이 문서는 공장 PC에 서버폰 설치 요청을 남기는 큐다. 서버폰 미연결 판정 문서가 아니다.
- 서버폰 설치와 연결 판정은 USB가 실제 물린 공장 PC Codex/작업자만 수행한다.
- 비공장/불확실 호스트에서는 ADB 목록, 설치, dumpsys, 무선 연결 같은 장치 명령을 실행하지 않고 큐/요청만 남긴다.
- ADB는 작업 전 항상 `C:\Users\wk700\platform-tools\adb.exe devices -l`로 현재 연결 장치를 확인한다.
- `device 1` 같은 별칭이나 이전 serial을 다음 작업에 가정하지 않는다. 장치가 1대면 그 serial, 여러 대면 사용자가 지정한 serial만 `-s`로 쓴다.
- 전역 `ANDROID_SERIAL`은 고정하지 않는다. 필요할 때만 현재 PowerShell 세션에서 `$env:ADB_DEVICE_SERIAL="원하는_시리얼"`처럼 임시 힌트로 둔다.
- 현재 서버폰 후보 serial은 `R39M30RWR2F`, 모델 후보는 `SM-G975N`이다. `R39M30RWR2F device`가 현재 목록에서 확인될 때만 그 serial로 설치와 `dumpsys package` 검증을 진행한다.

## 2026-07-02 공장 PC 실행 결과
- request: `/packhelper/codex_ops_v2/requests/ops_1782983264896_c832aaef`
- worker: `pc_codex_resource_01`
- 판정: blocked
- 공장 PC/USB 증거: `CODEX_OPS_HOST=pc`, `CODEX_OPS_NODE=pc_codex_resource_01`, USB serial `R39M30RWR2F` 단일 device
- 설치 시도: `adb -s R39M30RWR2F install -r app/build/outputs/apk/debug/app-debug.apk`
- 실패 원인: `INSTALL_FAILED_VERSION_DOWNGRADE: Package Verification Result`
- 현재 설치본: `com.workschedule.app`, `versionName=0701.2240`, `versionCode=1782945636`, `lastUpdateTime=2026-07-02 08:05:47`
- 시도 APK: `versionName=0605.1009`, `versionCode=1780654184`
- 금지 작업 미수행: wireless/IP:port, uninstall, `pm clear`, 데이터 삭제, 앱 실행, 카카오 발송 없음
- 다음 기준: 동일 APK 재설치는 반복하지 않는다. 더 높은 `versionCode`의 새 APK를 빌드한 뒤 공장 PC USB 설치를 다시 요청한다.

## 2026-07-02 18:43 KST 공장 PC 요청 결과
- request: `/packhelper/codex_ops_v2/requests/ops_1782985289409_101aa0ea`
- worker: `pc_codex_resource_01`
- 판정: blocked
- 요청 APK: `versionName=0702.1839`, `versionCode=1782985171`, `5,631,281 bytes`
- 요청 serial: `R39M30RWR2F` (`SM-G975N`, USB `device` 기준)
- 요청 명령: `adb -s R39M30RWR2F install -r app/build/outputs/apk/debug/app-debug.apk`
- 요청 검증: `adb -s R39M30RWR2F shell dumpsys package com.workschedule.app`
- 차단 원인: PC worker의 로컬 PowerShell 샌드박스 헬퍼 `codex-windows-sandbox-setup.exe` 누락으로 ADB 경로 확인, USB serial/model 확인, 설치, dumpsys 검증 단계까지 도달하지 못함
- 금지 작업 미수행: wireless/IP:port, uninstall, `pm clear`, 데이터 삭제, 앱 실행, 카카오 발송 없음

## 2026-07-02 19:04 KST 재확인 결과
- request: `/packhelper/codex_ops_v2/requests/ops_1782986325727_595fbc72`
- ADB 경로: `C:\Users\wk700\AppData\Local\codex_ops\tools\android-platform-tools\platform-tools\adb.exe`
- USB 확인: `R39M30RWR2F device`, model `SM_G975N`
- 설치 결과: blocked, `INSTALL_FAILED_VERSION_DOWNGRADE: Package Verification Result`
- 설치된 패키지: `versionName=0701.2240`, `versionCode=1782945636`, `lastUpdateTime=2026-07-02 08:05:47`
- PC 로컬 APK 확인 request: `/packhelper/codex_ops_v2/requests/ops_1782986507685_5e15f0e7`
- PC 시도 APK: `C:\root\WorkSchedule\app\build\outputs\apk\debug\app-debug.apk`, 5,618,682 bytes, mtime UTC `2026-06-22T21:58:37Z`
- 판단: PC의 WorkSchedule repo/APK가 stale이다. 최신 `/root/WorkSchedule` APK 또는 업데이트센터 최신 artifact를 PC가 받아 설치해야 한다.

## 공장 PC 전용 확인 항목
```bash
cd /root/WorkSchedule
git status --short
ls -l app/build/outputs/apk/debug/app-debug.apk
C:\Users\wk700\platform-tools\adb.exe devices -l
# 현재 연결 장치가 1대면 그 serial 사용, 여러 대면 사용자 지정 serial만 사용:
# C:\Users\wk700\platform-tools\adb.exe -s <현재확인_serial> install -r app/build/outputs/apk/debug/app-debug.apk
# C:\Users\wk700\platform-tools\adb.exe -s <현재확인_serial> shell dumpsys package com.workschedule.app | grep -E 'versionName|versionCode|lastUpdateTime'
```

## 금지
- `uninstall`, app data reset, 데이터 삭제 금지
- 무선 stale endpoint 반복 재시도 금지
- 카카오 발송 금지
- 설치 후 앱 실행은 별도 승인 후에만 수행
