# memory-app

Memory Map 앱과 Android APK 빌드용 Docker 환경.

## 카카오맵 설정

앱은 전면에 카카오맵(WebView + Kakao Maps JavaScript SDK)을 표시합니다.

1. [Kakao Developers](https://developers.kakao.com)에서 앱을 만들고 **JavaScript 키**를 발급
2. 플랫폼 > Web > 사이트 도메인에 `http://localhost` 등록
3. 키를 `EXPO_PUBLIC_KAKAO_JS_KEY` 환경변수로 전달 (`.env.example` 참고)

## APK 빌드

```bash
docker build -t rn-builder .
docker run --rm -e EXPO_PUBLIC_KAKAO_JS_KEY=<JS키> -v "$(pwd)/output:/output" rn-builder
```

PowerShell: `docker run --rm -e EXPO_PUBLIC_KAKAO_JS_KEY=<JS키> -v "${PWD}/output:/output" -v rn-gradle:/root/.gradle rn-builder`
Git Bash(Windows): 앞에 `MSYS_NO_PATHCONV=1` 을 붙이고 `$(pwd -W)/output` 사용

결과물: `output/app-release.apk` (debug 키로 서명됨 — 테스트용)

> 첫 빌드는 Gradle 의존성 다운로드로 10~20분 걸릴 수 있습니다. 
> 캐시: `-v rn-gradle:/root/.gradle` 를 추가하면 재빌드가 빨라집니다.

## 로컬 개발

```bash
npm install
npx expo start
```
