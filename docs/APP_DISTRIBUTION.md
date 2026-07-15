# K-LOL.GG 앱 배포 운영 문서

이 프로젝트의 앱 배포 기준은 정식 스토어 출시가 아닙니다.

- Android / Galaxy: APK 직접 배포
- iPhone: Safari 홈 화면 추가
- PC: 기존 웹 접속

## 핵심 원칙

1. APK 안에는 DB, Riot, OpenAI, Kakao 키를 넣지 않는다.
2. APK는 각 사이트의 `/app` 주소만 여는 얇은 앱으로 유지한다.
3. iPhone은 비용 없는 Safari 홈 화면 추가만 안내한다.
4. 새로운 카카오톡 오픈채팅방마다 Vercel 주소와 DB/env가 다르면 APK도 그 주소에 맞춰 다시 빌드한다.

## 방별 Android APK 만들기

앱 아이콘이나 Android 스플래시를 다시 만들고 싶으면 먼저 자산을 재생성합니다.

```powershell
npm run assets:app
```

방마다 서버 주소가 다르면 `CAPACITOR_SERVER_URL`만 바꿔 빌드합니다.

먼저 Android 빌드 환경을 확인합니다.

```powershell
npm run android:check-env
```

Java가 없다고 나오면 JDK 21 이상을 설치해야 합니다.

```powershell
winget install EclipseAdoptium.Temurin.21.JDK
```

설치 후 PowerShell을 새로 열고 다시 확인합니다.

```powershell
$env:CAPACITOR_SERVER_URL="https://k-lol-gg.vercel.app/app"
$env:KLOL_ANDROID_BUILD_NUMBER="1"
$env:KLOL_ANDROID_VERSION_NAME="0.1.0"
npm run android:sync
npm run android:build:debug
```

다른 방 예시:

```powershell
$env:CAPACITOR_SERVER_URL="https://A-room-gg.vercel.app/app"
$env:KLOL_ANDROID_BUILD_NUMBER="1"
$env:KLOL_ANDROID_VERSION_NAME="0.1.0"
npm run android:sync
npm run android:build:debug
```

빌드가 성공하면 APK와 메타데이터가 생성됩니다.

```text
public/downloads/android/klol-<version>-debug.apk
public/downloads/android/latest.json
```

`/install` 페이지는 `latest.json`을 읽어서 APK 다운로드 버튼을 자동으로 활성화합니다.

## 실제 배포용 release APK

운영 배포 전에는 release 빌드를 권장합니다. 단, release APK는 반드시 서명 키 설정이 먼저 필요합니다.
서명 없이 만들어진 `app-release-unsigned.apk`는 휴대폰에 설치할 수 없으므로 배포 메타데이터에 올리지 않습니다.

```powershell
$env:CAPACITOR_SERVER_URL="https://k-lol-gg.vercel.app/app"
$env:KLOL_ANDROID_BUILD_NUMBER="2"
$env:KLOL_ANDROID_VERSION_NAME="0.1.0"
npm run android:build:release
```

서명 키 설정 전에는 내부 테스트용 debug APK만 사용하세요. 서명 키는 절대 저장소에 커밋하지 않습니다.

```text
*.jks
*.keystore
android/key.properties
android/keystore.properties
android/signing.properties
```

현재 `.gitignore`에 위 파일들이 등록되어 있습니다.

## iPhone 설치 안내

iPhone은 APK처럼 파일 설치가 불가능합니다. 비용 없이 배포하려면 Safari 홈 화면 추가를 사용합니다.

1. Safari로 사이트 접속
2. 공유 버튼 선택
3. 홈 화면에 추가
4. 홈 화면의 K-LOL.GG 아이콘으로 실행

## 배포 전 10회 검토 체크리스트

1. `/app` 모바일 홈이 실제 앱 첫 화면처럼 보이는가?
2. `/install`에서 Android APK / Android 홈화면 / iPhone Safari가 명확히 분리되어 있는가?
3. APK 다운로드 버튼이 없는 상태에서도 사용자에게 “준비 중”으로 자연스럽게 보이는가?
4. APK 빌드 후 `latest.json`이 자동 갱신되는가?
5. Android APK가 `/app`로 바로 진입하는가?
6. APK에 민감키가 포함되지 않았는가?
7. iPhone 안내가 Safari 기준으로 충분히 짧고 명확한가?
8. 작은 화면에서 설치 탭과 버튼 텍스트가 넘치지 않는가?
9. 로그인, 카카오 구인, Riot 연동, AI 잠금 기능이 모바일에서도 막히지 않는가?
10. 각 방별 Vercel 주소를 바꿔 빌드할 수 있는가?

## 이번 패치 검토 결과

- PC/모바일 `/install` 분리: 모바일에서도 `/install`이 `/app`으로 강제 이동하지 않도록 예외 처리 완료.
- PWA 설치 요건: manifest, maskable icon, apple-touch-icon, service worker 등록 완료.
- 캐시 안정성: API, 관리자, APK 다운로드, 동적 `/app` 페이지는 서비스워커 캐시에서 제외.
- APK 배포: Capacitor Android 프로젝트와 빌드 스크립트 추가.
- 방별 배포: `CAPACITOR_SERVER_URL`로 각 Vercel `/app` 주소를 APK에 주입 가능.
- 버전 관리: `KLOL_ANDROID_BUILD_NUMBER`, `KLOL_ANDROID_VERSION_NAME`을 Android versionCode/versionName에 반영.
- 앱 아이콘: PWA/Apple/Android 런처 아이콘을 다크모던 K 마크로 통일.
- 스플래시: Android 기본 스플래시를 K-LOL.GG 다크모던 화면으로 교체.
- 보안: APK 안에는 서버 주소만 포함하며 DB/Riot/OpenAI/Kakao 키는 포함하지 않음.
- 현재 기준: Capacitor Android 빌드는 JDK 21 이상과 Android SDK 36이 필요합니다.

## 권장 운영 흐름

1. Vercel에 방별 사이트와 env를 연결한다.
2. `CAPACITOR_SERVER_URL`을 해당 방의 `/app` 주소로 설정한다.
3. Android APK를 빌드한다.
4. 생성된 APK와 `latest.json`을 배포 사이트에 포함한다.
5. iPhone 사용자는 `/install`에서 Safari 홈 화면 추가로 안내한다.
