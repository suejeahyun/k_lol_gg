# Kakao V1 strict 검증 증거

- 검증일: 2026-09-11
- 기준 원본: `tests/fixtures/kakao/v1/KLOL_KAKAO_BOT_V40_GUIDED_HUB.js`
- 기준 버전: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31`
- 원본 CRLF SHA-256: `c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7`
- 원본 LF SHA-256: `0514eb3c26862ffedfc132dbe1b258db25d30657aaf8455429467a151bfb18a2`
- 휴대폰 설치본: `integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js`
- 설치본 SHA-256: `cb1a52d3ec383addc9e66865c6d7896c0aca63c2753c66fb4f402aff9a422d6c`
- 설치본 크기: 54,167자 / 60,810바이트

## 반영 내용

- V40 R2 원본의 `response()` 순서와 도달 가능한 명령·양식·문구 함수 63개를 기준 fixture에서 추출한다.
- AST 호출 그래프로 `response()` 도달 함수 72개를 계산해 전송 seam 9개와 원본 함수 63개가 누락 없이 정확히 일치하는지 빌드 때 검사한다.
- 파티·내전·스크림·전적·랭킹·운영 양식의 구형 HTTP 호출만 현재 V4 raw-body HMAC command gateway로 치환한다.
- callback room과 sender 표시명은 명령 권한으로 사용하지 않는다. 명령 family가 `RECRUIT` 또는 `FEATURES` installation scope를 고른다.
- 한 사용자 입력은 HTTP 요청을 최대 한 번만 실행하고 텍스트 timeout은 5,000ms다.
- 구형 bearer, query/body secret과 폐기된 `/api/kakao/*` 호출을 설치본에 포함하지 않는다.
- V40 R2의 site-first 관리 링크와 clean-session imageDB 무응답·HTTP 0회 동작을 그대로 유지한다.
- strict 요청만 `protocol=KLOL_KAKAO_V1_STRICT`, `responseFormat=V1_SERVER_EXACT`를 서명 본문에 포함한다. 기존 V4의 7필드 요청과 사용자 응답은 그대로 유지한다.
- 시즌 현황은 V1과 같이 0회차=빈 안내, 1회차=전체 복사용 양식, 2회차 이상=회차 목록이며, 없는 상세도 빈 안내로 고정한다.
- 활성 시즌이 없을 때도 strict 현황은 오류가 아니라 V1의 빈 안내를 반환한다.
- 없는 스크림 상세는 V1과 같이 성공 응답의 `스크림 #N을 찾지 못했습니다.` 안내로 돌리고, 일반 V4의 NOT_FOUND 계약은 바꾸지 않는다.
- 스크림 일시는 `9/12 21:00`, 오전·오후, `H시`, `협의`를 V1 방식으로 파싱·표시하며 공개 DTO에는 내부 저장 prefix를 노출하지 않는다.
- 전체 검증에서 드러난 기존 Riot RSO state의 비정규 base64url 별칭 허용을 막아, 같은 HMAC 바이트의 다른 문자열 표현도 거부한다.

## 검증 결과

```text
V1 strict 서버·dispatcher 집중 검증: 40/40 통과
V1 strict 생성본·oracle·보안 집중 검증: 25/25 통과
전체 계약 테스트: 338/338 통과
전체 단위 테스트: 635/635 통과
ES5/Rhino 정적 검사: 경고 후보 0
ESLint: 오류 0 (기존 경고 31건)
TypeScript: 통과
Drizzle ERD drift: 없음 (101 tables, 163 foreign keys)
여성 안내 챔피언 이미지: 68/68, SHA-256 중복 0
Next.js production build: 통과, 92 static pages generated
현재 작업트리 secret scan: 통과
git diff --check: 통과
```

## 재현 명령

```powershell
npm run bot:kakao:v1-strict
node --test tests/kakao-v1-strict-oracle.test.mjs tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v1-site-first-image-boundary.test.mjs tests/kakao-v1-exact-v4-adapter-architecture.test.mjs tests/kakao-v40-exact-reply-parity.test.mjs
node scripts/audit-messengerbot-rhino-static.mjs integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js
npm run typecheck
npm test
npm run check
```

## 운영 반영 상태와 남은 확인

- 저장소 소스·생성본·전체 계약 338개와 단위 테스트 635개 검증: 완료
- GitHub `main`: `78852f363cee51fca044c468cf2299521c5ba99a`까지 push 완료
- Vercel production: deployment `dpl_98owgh5yXFqWAJzhjg7b1zUWXBvF` Ready, `https://k-lol-gg.vercel.app` alias 연결 확인
- 운영 `GET /api/health`: HTTP 200, `status=ready`
- 운영 strict schema 무서명 probe: HTTP 401 `INVALID_SIGNATURE`. 형식 단계의 400이 아니라 서명 검증까지 도달해 strict envelope 배포를 확인했다. 실제 비밀값은 사용하거나 출력하지 않았다.
- MessengerBot R 휴대폰 코드 교체: 미확인
- 실제 두 기능방에서 다른 사용자 생성→전체 양식 제출→수정→현황→마감: 미확인

정상 운영 범위 밖의 의도적 차이는 별도로 남긴다. 복수 ACTIVE 시즌은 데이터 불변식 위반으로 거부하고, 다른 휴대폰에서 새 event ID로 같은 운영 양식을 다시 보내는 교차 설치 중복은 이번 한 휴대폰 범위에 포함하지 않는다. 교체 직후 남아 있을 수 있는 V39의 30분 이미지 세션도 복원하지 않는다.

휴대폰 실기기 교체와 카카오톡 실제 송수신은 이 저장소 테스트가 대신 증명할 수 없다. 설치 후 `/봇버전`, `5인파티`, 채운 양식 제출, `구인현황`, `번호ㅉ` 순서로 최종 확인한다.

## 다음 패치 추천

1. 실기기 검증 결과를 입력·출력 원문과 설치본 SHA-256으로 증거 폴더에 추가한다.
2. V1에 없던 기능은 `APPROVED_EXTENSIONS` 전용 설치본으로 분리하고 V1 strict 앞단에 섞지 않는다.
3. 운영 응답 지연의 p50·p95를 서버 타이밍으로 수집하되 사용자 메시지나 원문 식별자는 기록하지 않는다.
4. V1 기준을 바꿀 때는 기존 fixture를 수정하지 말고 새 기준 파일·해시·버전으로 추가한다.
