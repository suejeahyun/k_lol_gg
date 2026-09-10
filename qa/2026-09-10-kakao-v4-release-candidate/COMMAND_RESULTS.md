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
| `npm run test:contracts` | 307 | 0 | PASS |
| `npm run test:unit` | 609 | 0 | PASS |
| `npm run typecheck` | - | - | PASS |
| 변경 TypeScript/MJS 12개 ESLint | - | - | PASS, 오류·경고 0건 |
| `npm run build` | - | - | PASS, V4 route 포함·정적 페이지 92개 |
| tree secret scan | - | - | PASS, high-confidence finding 0건 |

## 생성 산출물

| 운영 산출물 | 문자 수 | 바이트 | 줄 | 최대 줄 길이 | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| UNIFIED | 13,018 | 15,534 | 276 | 471 | `95d8897d5d6f6330d0ebad05413636ae536269087c02d2f09970fe3b6b8c9501` |

V4 루트의 paste-ready 운영 산출물은 UNIFIED 하나뿐이다. 분리형 두 산출물은 `legacy-split-profiles`로 이동했으며 설치하지 않는다. SHA-256은 현재 worktree 바이트 기준이다. 설치 과정에서 줄바꿈이 바뀌면 해시도 달라지므로 paste 직전 파일과 대조한다.

## 수행하지 않음

- push 또는 deploy.
- 운영/Preview DB 접속, query, migration apply/down, row 변경.
- 환경변수 또는 MessengerBot private secret 값 조회·출력·변경.
- 실제 카카오방과 MessengerBot-R 기기 조작.
