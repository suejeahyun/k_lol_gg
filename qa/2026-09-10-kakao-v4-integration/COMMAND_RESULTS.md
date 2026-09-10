# Kakao V4 Phase 2 검증 결과

검증일: 2026-09-10 (Asia/Seoul)

## 3개 Phase 2 커밋 직후 baseline

통합 수정 전에 요청된 실패 재현 수를 확인했다.

| Suite | 통과 | 실패 |
| --- | ---: | ---: |
| Artifact acceptance | 5 | 0 |
| Client acceptance | 3 | 9 |
| Server acceptance | 4 | 11 |
| 합계 | 12 | 20 |

## 최종 휴대폰 산출물

명령: `npm run build-messengerbot:v4`

| 산출물 | 결과 |
| --- | --- |
| `integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_RECRUIT_MESSENGERBOT_R.js` | 생성됨, 8,700자 |
| `integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_FEATURES_MESSENGERBOT_R.js` | 생성됨, 8,829자 |

## 최종 검증 증거

| 검증 | 통과 | 실패 | 결과 |
| --- | ---: | ---: | --- |
| V4 artifact/client acceptance | 17 | 0 | PASS |
| V4 server acceptance | 15 | 0 | PASS |
| V4 classifier/gateway/dispatcher | 27 | 0 | PASS |
| V1 golden/compatibility 회귀 | 57 | 0 | PASS |
| 최종 테스트 합계 | 116 | 0 | PASS |
| `npm run typecheck` | - | - | PASS |
| 변경 파일 ESLint | - | - | PASS, 오류·경고 0건 |
| `npm run build` | - | - | PASS, Next.js V4 route 포함·정적 페이지 92개 생성 |

## 실제 dispatcher 연결 범위

- RECRUIT PARTY: 생성, 현황, 상세, 전체 snapshot 동기화, 종료.
- RECRUIT SCRIM: 현황, 상세, 사용 중단 lifecycle 안내. `스크림구인`은 mutation 없이 V1 호환 편집 양식을 반환한다.
- FEATURES PLAYER: 전적, 최근 경기, 랭킹.
- Gateway 자체 응답: V4 상태, 계약, 일반 도움말, 구인 도움말.
- 인식된 명령은 classifier, 정적 profile 검사, canonical 변환을 거친 뒤 안전한 typed 변환이 있는 경우에만 dispatcher로 전달된다.
- 운영 dependency가 없으면 public `SERVER_UNAVAILABLE`로 fail-closed한다. dispatcher 없는 성공 fallback은 application 단위 테스트에서만 사용한다.

## Public error 계약

- `WRONG_PROFILE`
- `INVALID_SIGNATURE`
- `REPLAY_CONFLICT`
- `SERVER_UNAVAILABLE`
- `INVALID_FORM`

MessengerBot client도 동일한 다섯 category를 노출한다. 네트워크 재시도는 미리 만든 request body와 동일한 `eventId`를 재사용한다.

## 의도적으로 남긴 501 범위

- FEATURES INHOUSE 명령과 전체 snapshot: season/date/round의 안전한 canonical mapping이 추가로 필요하다.
- FEATURES OPERATIONS 양식, 등록, 경고, 증거·사진, 예약 공지, 운영자 전용 raw 명령.
- RECRUIT SCRIM 전체 양식 snapshot mutation: non-null scrim number와 활성 대회 판별 계약이 먼저 필요하다.
- Public V4 계약에 포함되지 않은 internal/local 진단 및 raw V2 명령.
- V1 호환 typed 변환이 없는 알 수 없는 명령과 잘못된 입력.

이 경로들은 추정 기본값으로 실행하지 않고 `NOT_IMPLEMENTED`로 fail-closed한다.

## 범위 및 운영 상태

- 소스, 생성 산출물, 테스트, QA 증거는 지정된 격리 worktree에서만 갱신했다.
- push, 배포, DB 변경, secret 변경, 운영 서버 재시작은 수행하지 않았다.
- 따라서 운영 반영은 **미적용**, 운영 검증은 **미확인**이다.
