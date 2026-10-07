# MMR 관리자 요청 복구 독립 검토

- 기준 소스: `0716a60bf09654118cc40493481839d75269b3f7`의 `MmrAdminActions`.
- 범위: 실제 TSX를 변환해 실행한 이벤트 핸들러, 합성 HTTP 응답, repository·HTTP 응답 계약 대조. 운영 요청·브라우저 조작·DB·백업 실행 없음.
- 수정 전 재현: `node --test .tmp/mmr-admin-recovery-review.test.mjs` — 5건 중 1 PASS / 4 FAIL. 원본 결과는 `mmr-admin-recovery-before.log`에 보존.

## 확인된 문제

| 중요도 | 실제 관찰 | 원인과 영향 |
| --- | --- | --- |
| P2 | 재계산 HTTP 200 `{}`에 완료 표시와 `router.refresh()` 실행 | 상태 코드만 확인하고 `revision`, `generation`, 작업별 응답을 검증하지 않아 게시 확인 없는 성공 안내가 가능하다. |
| P2 | 동일 조정 payload·If-Match로 두 번 시도해도 요청 키가 바뀜 | 첫 요청이 커밋된 뒤 응답이 유실되면 기존 영수증을 재생할 수 없다. 서버 계약을 따른 합성 응답에서는 두 번째 요청이 412가 되어 완료 확인에 실패한다. |
| P2 | 같은 tick의 두 submit에서 실제 fetch가 두 번 호출됨 | 즉시 ref 잠금 없이 render 시점의 disabled만 사용한다. |
| P2 | 성공 후 refresh가 아직 완료되지 않았는데 제출 버튼 disabled=false | stale generation으로 재시도할 수 있고, 완료 메시지가 뒤이은 충돌 응답으로 대체될 수 있다. |

권한 없는 ADMIN의 폼 비노출과 정상 재계산의 경로·빈 body·If-Match 전송은 PASS했다.

## 서버 안전 경계와 해석

`postgres-mmr-repository.ts`의 `idempotent`는 동일 키·요청의 저장 영수증을 먼저 재생한다. `publishProjection`은 전역 advisory lock을 획득하고 현재 generation을 검사한 **뒤** 수동 조정을 삽입한다. 따라서 같은 generation으로 발생한 중복 POST가 중복 원장 삽입으로 이어진다는 주장은 하지 않는다. 이번 재현은 사용자에게 잘못된 완료를 알리거나 확정된 작업을 안전하게 재확인하지 못하는 클라이언트 결함이다. DB 실행을 포함한 신규 검증은 하지 않았다.

기존 `ClientMutationKeyStore`가 payload·revision별 동일 키 보존을 제공하고, 관리자 이벤트 설정·경기 검토에 ref guard 및 refresh transition 패턴이 있다. Next 설치 문서의 `use-router.md`는 `refresh()`가 기존 client state를 유지하며 새 Server Component 응답을 병합한다고 명시한다. 최소 수정은 이 패턴 재사용, 작업별 성공 응답 검증, 미확정 요청 동일 키 재시도, 확정 후 새 generation 확인 전 잠금이다.

제품 수정은 아직 하지 않았으며 통합 담당자와 파일 소유 범위를 조율 중이다. 실제 운영 MMR 공식 전환·SUPER_ADMIN 로그인·백업 성공을 이 문서로 주장하지 않는다.

후속: 통합 담당자가 수정 범위를 승인한 뒤 1.0.8 후보에서 수정했다. 위 내용은 최초 독립 검토 시점의 상태이며, 수정·검증 결과는 `../service-completion-v1.0.8-2026-10-07/mmr-admin-recovery.md`와 해당 실행 로그에 기록했다.
