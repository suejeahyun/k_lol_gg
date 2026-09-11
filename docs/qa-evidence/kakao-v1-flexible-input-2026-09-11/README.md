# Kakao V1 유연 입력 패치 QA

- 검증일: 2026-09-11
- 코드 커밋: `0ec3e9fe4bce5244fb628130709750301c720452`
- 운영 배포: `dpl_HNSKfjtJJEey9DSBBqDiybsU96Uf`
- 운영 주소: `https://k-lol-gg.vercel.app`
- 휴대폰 설치본: `integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js`
- 설치본 버전: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R3_2026_09_11`
- 설치본 SHA-256: `6DBA8CE33576BD6C8E383CEF7C862D149BBA67E9240B290DB37FEE7F26A2D57F`

## 반영 내용

- V1 양식의 제목, 모집번호, 전체 슬롯과 예비 행 구조는 유지하면서 숫자 행의 `.`, `)`, 공백, 카카오 표시용 `\.` 및 전각 숫자·구두점을 같은 슬롯으로 읽는다.
- 분류기와 실제 참가자 변환기가 하나의 공통 행 파서를 사용해 휴대폰이 보낸 양식과 서버 저장 결과가 달라지지 않게 했다.
- 배너 첫 `[`가 지워져도 나머지 구조가 완전하면 정상 처리한다.
- 일반 대화와 단순 숫자 목록은 양식으로 취급하지 않으며, `20:00` 같은 시각을 참가자로 읽지 않는다.
- 휴대폰 설치본은 HTTP 400 입력 오류, 401/403 인증 설정 오류, 5xx·timeout 연결 오류를 서로 다른 고정 안내로 표시하고 원문 오류나 비밀값을 노출하지 않는다.

## 검증 결과

- `npm run check`: PASS
  - ESLint: 오류 0건, 기존 경고 31건
  - TypeScript: PASS
  - Drizzle ERD: 101 tables, 163 foreign keys, drift 없음
  - 계약 테스트: 338/338 PASS
  - 단위 테스트: 638/638 PASS
  - 여성 안내 챔피언 이미지: 68/68 PASS
  - Next.js production build: 92 static pages PASS
- 유연 파서 집중 테스트: 14/14 PASS
- V1 strict 설치본 테스트: 11/11 PASS
- 운영 배포 Ready 및 alias 연결 확인
- 운영 `GET /api/health`: HTTP 200, `status=ready`
- 운영 strict 형식·서명 경계 probe: 올바른 envelope와 고의로 틀린 서명에 HTTP 401 `INVALID_SIGNATURE`

## 운영 반영 상태와 남은 위험

- 서버 파서는 운영에 반영되어 현재 휴대폰 설치본에서도 `2 발` 양식을 다시 보내면 처리할 수 있다.
- 새 오류 안내와 `/봇버전` R3 표시는 휴대폰에서 새 설치본으로 교체해야 반영된다.
- 휴대폰 MessengerBot R 실제 교체와 카카오 실송수신은 아직 확인하지 않았다.
- 기존 `#9` DRAFT는 삭제하지 않았다. 전체 양식을 다시 제출하면 같은 번호를 찾아 활성화하는 기존 흐름을 사용한다.

## 다음 패치 추천

1. 실기기에서 `5인파티 → 2 발 포함 전체 양식 → 구인현황 → 상세 9 → 9ㅉ` 순서의 실제 메시지를 확인한다.
2. 익명화한 실기기 줄바꿈·자동 구두점 변형을 회귀 fixture에 축적한다.
3. `INVALID_FORM` 발생률과 서버 처리시간 p50·p95를 개인정보 없이 관측한다.
