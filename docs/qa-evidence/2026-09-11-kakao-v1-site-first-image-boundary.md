# Kakao V1 strict: site-first 이미지 경계 확인

- 확인일: 2026-09-11
- 기준 파일: `tests/fixtures/kakao/v1/KLOL_KAKAO_BOT_V40_GUIDED_HUB.js`
- 기준 버전: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31`
- 기준 SHA-256 (CRLF): `c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7`

## 확인된 동작

V40 R2의 공개 운영 명령은 `response()`에서 `isManagedWorkflowMessage(text)`로 분류된 뒤
`handleSiteFirstManagedWorkflow(text, replier)`로 종료된다. 이 함수는 내전 결과·경고·인증의 사이트
링크만 응답한다. 구형 public code를 저장하던 `handleManagedWorkflowMessage()`는 선언만 존재하며
`response()`에서 호출되지 않는다.

따라서 새로 설치한 V40 R2에는 이미지와 연결할 active public code 또는 UUID session을 만드는
사용자 경로가 없다. 저장된 구형 `KLOL_MANAGED_UPLOAD_V1_*` 값이 없는 정상 설치에서 imageDB 입력은
추가 서버 요청이나 사용자 응답 없이 끝난다. V1 strict 후보는 이 관찰 가능한 동작을 유지하도록
`handleManagedImage()`와 placeholder fallback을 `false`로 둔다.

## 결정

도달할 수 없는 `/api/integrations/kakao/v4/image-receive` route나 `/V2사진세션` 명령을 V1 strict에
추가하지 않는다. 이는 V1과 다른 사용자 흐름을 새로 만드는 일이기 때문이다. 기존
`/api/integrations/kakao/image-receive`는 다른 signed session client를 위해 유지하며, raw-body HMAC,
4,200,000-byte 상한, active session, sender hash, digest와 비공개 저장 검증을 그대로 적용한다.

향후 카카오 imageDB 업로드를 다시 제공하려면 V1 exact가 아니라 승인된 확장 기능으로 별도 버전과
사용자 흐름을 정의하고, 사이트에서 실제 session을 발급·연결하는 UI부터 end-to-end로 추가해야 한다.

## 재현

```powershell
node --test tests/kakao-v1-site-first-image-boundary.test.mjs
```
