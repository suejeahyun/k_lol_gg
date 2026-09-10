# Kakao V4 Phase 4-A 호환성 종료

검증일: 2026-09-10 (Asia/Seoul)

기준 커밋: `924ebd187c0064274a403414881fbf7cd4a3b362`

## 확인된 변경

- 휴대폰 입구에서 V1 공개 명령과 실제 V41 공개 명령만 프로필별로 허용한다.
- `봇버전`, 일반 도움말, 구인 도움말, 구인 웹 도우미는 휴대폰에서 서버 호출 없이 응답한다.
- `사진상태`는 존재하지 않는 V4 사진 세션을 표시하지 않고 사이트 제출 경로를 안내한다.
- `내전확인 <코드>`와 `내전미리보기취소`는 폐기된 미리보기 흐름과 현재의 전체 양식 즉시 동기화를 안내하며 데이터를 변경하지 않는다.
- V2 도움말·진단·연동 확인·raw payload·`V2사진취소`는 일반 휴대폰 전송에서 제외한다.
- unknown/malformed 직접 API 입력은 HTTP 400 `INVALID_FORM`으로 닫고, V4 경로에서 501 `ROUTER_NOT_ENABLED`를 제거했다.
- 0/1 slash, RECRUIT/FEATURES 분리, 5초 timeout, 명령당 전송 1회, ES5/Rhino 정적 경고 0건을 유지했다.

## 산출물

- `KLOL_KAKAO_BOT_V4_RECRUIT_2026_09_10_R2`
- `KLOL_KAKAO_BOT_V4_FEATURES_2026_09_10_R2`
- RECRUIT 생성본: 12,369자
- FEATURES 생성본: 12,498자

## 운영 상태

- 소스 수정, 생성본 재빌드, 자동 테스트, typecheck, ESLint, production build까지 확인했다.
- 실제 MessengerBot-R 설치, 카카오방 callback, 배포 URL, 운영 DB 연동은 수행하지 않았다.
- push, deploy, 운영 DB 변경, secret 변경은 수행하지 않았다.
- 운영 반영: 미적용.
- 실기기 검증: 미확인.

## 남은 위험

- 실제 Kakao/MessengerBot-R의 메시지 정규화와 기기별 Rhino 차이는 실기기에서 확인해야 한다.
- 휴대폰 공개 명령 allowlist와 서버 classifier는 별도 언어 구현이므로, 명령 추가 시 두 계약 테스트를 함께 갱신해야 한다.
- 사이트 링크는 현재 production 경로 계약을 사용하지만 실제 로그인·권한·업로드 완료는 이번 범위에서 확인하지 않았다.

## 다음 패치 추천

1. 실제 두 기기에 R2 생성본을 설치하고 로컬 응답 무통신 여부와 일반 명령 callback 1회를 로그로 남긴다.
2. 공개 명령 계약에서 MessengerBot ES5 allowlist를 자동 생성해 서버 classifier와의 이중 구현 편차를 줄인다.
3. 내부 V2 진단 명령은 일반 봇 코드와 분리된 운영자 전용 도구로 이동한다.
4. 사이트 사진 제출 링크의 로그인·권한·업로드 완료까지 E2E smoke test를 추가한다.
5. V4 400 응답의 명령별 입력 예시를 bounded detail로 세분화한다.
