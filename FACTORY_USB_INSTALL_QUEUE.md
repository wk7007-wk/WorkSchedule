# WorkSchedule 공장 PC USB 설치 큐

- 기록 시각: 2026-07-02 18:43 KST
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
- USB serial은 `R39M30RWR2F` 고정이다. 모델은 `SM-G975N`, 정상 상태는 `device`다.
- 자동화/요청/스크립트는 하나만 연결돼 있어도 이름이나 순번으로 찾지 않고 항상 `-s R39M30RWR2F`를 붙인다.
- USB `R39M30RWR2F device` 상태가 확인되기 전에는 설치와 `dumpsys package` 검증을 진행하지 않는다.

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

## 공장 PC 전용 확인 항목
```bash
cd /root/WorkSchedule
git status --short
ls -l app/build/outputs/apk/debug/app-debug.apk
adb devices -l
# USB R39M30RWR2F device 상태일 때만:
# adb -s R39M30RWR2F install -r app/build/outputs/apk/debug/app-debug.apk
# adb -s R39M30RWR2F shell dumpsys package com.workschedule.app | grep -E 'versionName|versionCode|lastUpdateTime'
```

## 금지
- `uninstall`, app data reset, 데이터 삭제 금지
- 무선 stale endpoint 반복 재시도 금지
- 카카오 발송 금지
- 설치 후 앱 실행은 별도 승인 후에만 수행
