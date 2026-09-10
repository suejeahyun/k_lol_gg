# 최종 검증 결과

## 통합 커밋

| 원본 커밋 | 통합 결과 |
| --- | --- |
| `d39be7abacb6ca29ce0cd18fb48fa9ecbb572e78` | `f3fe82f3`, public compatibility closure |
| `e67118fe` | `8b635170`, Phase 4 acceptance |
| `1b1e64be` | `63c75a07`, release-readiness 문서·테스트 |
| `cae851c6` | `290b6821`, installation-scope 인증 |

## Phase 4 baseline에서 final까지

- 요청에서 제공된 원래 baseline: 8/25 통과, 17/25 실패.
- 네 커밋 통합 직후 실제 Phase 4 acceptance: 22/25 통과, 3/25 실패.
- 확대 readiness/Phase 5 포함 최초 실행: 46/49 통과, 3/49 실패.
- 최종 Phase 4 acceptance: 25/25 통과, 실패 0.
- 최종 Phase 4+5+readiness 집중 묶음: 50/50 통과.

## 전체 검증

| 검증 | 통과 | 실패 | 결과 |
| --- | ---: | ---: | --- |
| Phase 4 acceptance | 25 | 0 | PASS |
| Phase 5 installation-scope | 9 | 0 | PASS |
| Phase 4 closure 보강 테스트 | 11 | 0 | PASS |
| Release-readiness | 5 | 0 | PASS, P0 RESOLVED |
| Phase 2·3·V1 client/golden | 95 | 0 | PASS |
| Phase 2·3 server/dispatcher | 91 | 0 | PASS |
| `npm run test:contracts` | 309 | 0 | PASS |
| `npm run test:unit` | 613 | 0 | PASS |
| `npm run typecheck` | - | - | PASS |
| 변경 TypeScript/MJS 12개 ESLint | - | - | PASS, 오류·경고 0건 |
| `npm run build` | - | - | PASS, V4 route 포함·정적 페이지 92개 |
| tree secret scan | - | - | PASS, high-confidence finding 0건 |

## 생성 산출물

| 운영 산출물 | 문자 수 | 바이트 | 줄 | 최대 줄 길이 | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| UNIFIED | 15,780 | 18,756 | 347 | 471 | `aef8694ab9fdfea6d734d9b5c59e7f701ebddd950573222da4f7527bc3d2644c` |

V4 루트의 paste-ready 운영 산출물은 UNIFIED 하나뿐이다. 분리형 두 산출물은 `legacy-split-profiles`로 이동했으며 설치하지 않는다. SHA-256은 현재 worktree 바이트 기준이다. 설치 과정에서 줄바꿈이 바뀌면 해시도 달라지므로 paste 직전 파일과 대조한다.

실제 휴대폰용 `.private/KLOL_KAKAO_BOT_V4_UNIFIED_PRIVATE_MESSENGERBOT_R.js`는 16,419자·19,409바이트이며 ES5·단일 callback·Rhino 정적 검사에 통과했다. `--refresh`는 기존 V4 전용 keyring을 보존한 채 공개 코드를 교체한다. 비밀값이 있으므로 Git에서 제외했고 본문·해시는 QA 문서에 기록하지 않는다.

## 파티 양식 선행·속도 패치

- `2인파티`, `5인파티`, `자랭구인` 등 파티 양식 생성은 휴대폰에서 즉시 처리한다: HTTP 0회, `CREATE_PARTY` 0회.
- 번호를 생략한 빈 양식은 `모집번호: #자동배정`으로 표시하며 DB 파티를 만들지 않는다.
- 이름이 한 명 이상 입력된 전체 양식의 첫 전송에서만 `CREATE_PARTY` 1회와 번호 배정을 수행한다.
- `2인 파티`처럼 띄어 쓴 별칭도 같은 로컬 경로로 처리한다.
- 슬롯이 일부 잘린 양식은 거부하고, 숫자가 명시된 기존 모집을 찾지 못하면 새 파티로 대체 생성하지 않는다.
- 등록 응답은 확정 번호가 들어간 수정용 전체 양식을 포함한다. 이후 같은 번호의 전체 양식은 authoritative `SYNC_PARTY`, 빈 명단은 전체 취소 반영으로 유지한다.
- 명시적 번호가 있는 생성 명령과 기존 숫자 양식은 계속 지원한다.

## 수행하지 않음

- 운영/Preview DB 접속, query, migration apply/down, row 변경.
- 기존 V1/V41 환경변수 또는 비밀값 조회·출력·변경.
- 실제 카카오방과 MessengerBot-R 기기 조작.

## 운영 배포

- GitHub `main`과 기능 브랜치에 검증 코드 커밋 `00c2077c1a0dfdd7959430e105bab8e5307a65b1`을 동일하게 푸시했다.
- Vercel Production 배포 `GaCfdRo6rafGatUDx37QGJkPgETD`가 `Ready`임을 UI에서 확인했다.
- 운영 `/`, `/api/health`, `/recruits`는 HTTP 200이다.
- private one-paste 파일과 동일한 V4 전용 keyring으로 서명한 `5인파티` 운영 요청은 HTTP 200, 계약 `KLOL_KAKAO_COMMAND_V4`, `#자동배정`·저장 안내 존재, 시작시간·게임정보 미노출로 확인했다. 모집 데이터는 생성하지 않았고 비밀값·서명·식별자는 출력하지 않았다.
