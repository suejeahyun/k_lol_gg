# Kakao V4 command classifier QA

작업일: 2026-09-10 KST

## 범위

- 순수 함수 `classifyKakaoV4Command` 구현
- V41 command parity 표본 101개를 40개 canonical 명령으로 축약
- 구조적 SNAPSHOT과 V4 probe를 포함한 전체 canonical 명령 46개
- `RECRUIT` / `FEATURES` 명령 허용 매트릭스와 `WRONG_PROFILE`
- 파티·내전·스크림 전체 양식 우선 분류 및 0명 양식 허용
- V2/V4 진단·raw JSON의 `LOCAL` + `INTERNAL` 분리

DB, HTTP, 운영 서버, MessengerBot 설치본은 변경하지 않았다.

## 프로필 계약

| 프로필 | 사용자 명령 계열 |
|---|---|
| `RECRUIT` | 파티, 스크림, 구인 도움말 |
| `FEATURES` | 내전, 전적·최근·랭킹, 등록·경고·운영 양식 |
| 공통 | 봇 버전, 일반 도움말, V4 상태·계약 및 진단 LOCAL 명령 |

잘못된 프로필에 도착한 알려진 명령은 `UNKNOWN`으로 숨기지 않고 `WRONG_PROFILE`로 분류한다.

## 산출물

- `src/modules/recruiting/kakao-v4/classifier.ts`
- `tests/kakao-v4-command-classifier.test.ts`
- `qa/2026-09-10-kakao-v4-classifier/COMMAND_RESULTS.md`
- `qa/2026-09-10-kakao-v4-classifier/DISCORD_PATCH_NOTICE.md`

## 판정

- 원본 별칭 표본: 101
- 표본에서 사용된 canonical 명령: 40
- 전체 canonical 명령: 46
- 미분류 표본: 0
- 집중 classifier + gateway 테스트: 17 passed, 0 failed
- TypeScript: pass
- ESLint: exit 0, 기존 생성물/테스트 경고 25개, 신규 파일 오류·경고 0개
- 운영 반영: 하지 않음

## 남은 범위

- classifier 결과를 실제 dispatcher에 연결하는 작업은 다음 단계다.
- 이 단계의 gateway는 기존 계약대로 probe 외 명령에 아직 501을 반환한다.
- payload 변환, DB 트랜잭션, exact reply 조립은 구현하지 않았다.
