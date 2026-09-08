# V2 Kakao V41 전환 QA

상태: 소스·로컬 계약 검증 완료. 운영 환경변수 변경, MessengerBot R 적용, 실제 Kakao 호출, Vercel 배포는 하지 않았다.

## 변경·검증 근거

- 붙여넣기용 독립 엔트리 `KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`를 transport/router에서 결정적으로 생성한다.
- 주요 명령(`/전적`, `구인현황`, `스크림현황`, `내전현황`, 내전 신청 양식)과 구조화 모집·양식·사진 수신이 canonical V2 helper만 사용한다.
- 구형 party/scrim mutation URL은 redirect나 구형 secret 승격 없이 `410 KAKAO_BOT_UPGRADE_REQUIRED`로 종료한다.
- Webhook 인증 거절 로그는 allowlisted reason, route, trace ID만 기록한다.
- Kakao pending slot은 상태와 무관하게 기존 행을 잠그며 unresolved snapshot은 같은 행을 ACTIVE로 재사용한다. SITE 신청과 검토 완료 신청은 보존한다.

실행 결과:

- `npm run bot:kakao:v41`: PASS
- `node --check integrations/messengerbot-r/KLOL_KAKAO_BOT_V41_V2_COMPLETE.js`: PASS
- 신규/관련 contract test 5개: PASS
- 신규 HTTP/legacy transition unit test 2개: PASS
- 전체 unit test 449개: PASS
- `npm run typecheck`: PASS
- 변경 대상 ESLint: PASS
- `npm run security:secrets`: PASS
- 전체 contract test 115개: PASS
- 격리 PostgreSQL 18 전체 DB 계약과 신규 pending resolve/cancel·재활성화 회귀: PASS
- 격리 DB 클러스터와 임시 경로 정상 제거: PASS

## Discord 복붙 공지

```text
[K-LOL.GG 카카오봇 V41 준비]
- 카카오 연동이 V2 원문 HMAC 서명 방식으로 전환됩니다.
- 전적, 구인현황, 내전현황, 내전 신청 동기화가 새 API를 사용합니다.
- 구형 문장형 파티·스크림 등록은 안전한 전환을 위해 사이트 또는 V2 구조화 명령을 이용합니다.
- 운영 반영 전 별도 봇 사본과 스테이징에서 서명·허용 방·허용 발신자·revision 흐름을 확인합니다.
```

## 다음 패치 추천

1. 스테이징 MessengerBot R에서 정상·만료 timestamp·잘못된 room을 각각 검증한다.
2. 실제 party create→sync→status→finish의 aggregate ID/revision 저장 UX를 JSON 입력 없이 제공한다.
3. 키 회전 시 identity key는 유지하고 signing previous/current 전환을 자동 점검한다.
4. `TEST_DATABASE_URL` 전용 DB에서 pending CANCELLED/RESOLVED 재활성화 계약을 실행한다.
