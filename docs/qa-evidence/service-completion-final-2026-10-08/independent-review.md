# 최종 수정 후 독립 검토 — 2026-10-08 KST

검토 시각: 2026-10-07 16:06 UTC 이후. 수정 담당자와 별도로 현재 diff·실제 호출부·관련 handler 회귀를 읽었다. 이 검토 중 제품 코드를 변경하거나 서버·브라우저·운영 작업을 실행하지 않았다. 새 결함을 뒷받침할 근거가 없어 이미 통과한 검사를 반복하지 않았다.

**결론: 아래 변경 범위에서 새 중대 오류나 명확한 주요 과업 방해 회귀를 발견하지 못했다.** 이는 전체 서비스의 모든 실제 기기·외부 응답·상태 조합을 확인했다는 의미가 아니다. 최종 빌드의 실제 UI와 배포 후 검증은 root의 별도 근거로 판정한다.

## MMR 전체 원장 재계산 확인창

검토: `src/app/(admin)/admin/balance-ai/mmr-admin-actions.tsx`, `tests/mmr-admin-recovery.test.mjs`, 기존 명령·복구 흐름.

- 초기 초점을 취소에 두고 양쪽 Tab 경계와 Escape를 처리한다. 닫을 때 실행 버튼 또는 작업 영역으로 돌아가며 body overflow를 원래 값으로 복원한다.
- 모달 open ref와 수동 조정 fieldset 잠금이 함께 적용돼 React 재렌더 전 배경 조정 제출도 차단한다.
- 확인 시 기존 command를 그대로 호출한다. 즉시 `sending` ref, pending/refresh, 확인된 generation 잠금, 기존 멱등 키, `If-Match` 및 성공 응답 검증을 우회하는 새 경로는 없다.
- 401/403 로그인 복구, 412 최신 결과 확인, 일시 실패의 같은 요청 재확인, 성공 후 새 generation 대기 정책이 유지된다. 초점 처리 변경이 계산·권한·DB transaction을 변경하지 않는다.
- 직접 확인 URL, 중복 확인, 배경 handler, 취소·초점 복원의 합성 회귀가 실제 component handler를 평가한다. 실제 React scheduling·브라우저 포커스·보조기기 동작 전체를 대신하지 않는다.

실제 공식 전환은 별도 1.0.8 운영 UI에서 이뤄졌다. [전환 후 운영 확인](mmr-post-transition-operating.md)의 공개 API·READ ONLY 재생 검증·자연 cron 근거와 **이번 확인창 개선의 1.0.9 배포 여부를 구분**한다.

## 대회 갤러리 확대창

검토: `gallery-lightbox.tsx`, 연결한 대회 `page.tsx`, `events.module.css`, 실제 `ResilientMediaImage`, `tests/destruction-gallery-dialog.test.mjs`.

- `showModal()`을 사용하는 native dialog로 배경의 비활성 상태를 브라우저에 맡긴다. 초기 닫기 초점, Tab, Escape, unmount 시 스크롤·해당 thumbnail 초점 복원이 연결된다.
- Escape는 기존 닫기 Link의 `?tab=gallery` 경로를 사용한다. 기존 이미지 URL·ordinal·제목·접근 가능한 이름과 서버의 공개 데이터 조회/유효성 검사는 유지된다.
- `ResilientMediaImage`의 로딩·오류 대체 UI에는 추가 focusable control이 없어 현재 단일 닫기 Tab 정책과 충돌하지 않는다.
- native dialog의 기본 크기·여백을 기존 전체 화면 구조에 맞췄고 긴 내용은 내부에서 스크롤된다. 변경된 `styles.lightbox`의 실제 사용처는 이 새 component 한 곳이다.
- 합성 시험은 실제 Page가 새 lightbox를 연결하는 것과 lifecycle/Link handler를 검증한다. mock `showModal()`·Link는 native top layer와 Next client navigation의 실제 증거가 아니다. 이 부분의 브라우저 확인은 별도 기록해야 한다.

## Riot 두 일괄 작업 확인창 — 최종 diff 독립 검토

검토: `src/components/riot/riot-admin-actions.tsx`, `tests/riot-modal-accessibility.test.mjs`, 관리자 page의 분기, 모달 CSS, `/api/admin/riot/bulk`·`bulk-link`의 서버 경계.

- 두 확인창 모두 초기 취소 초점, Tab 양 끝, Escape, 종료 후 trigger/작업 영역 초점, body overflow 복원을 처리한다.
- 선택 동기화는 `modalOpen`·`sending` ref가 재렌더 전 배경 제출과 중복 확인을 차단한다. 모달을 열면 두 배경 form이 inert이고 선택 변경 handler도 잠긴다. 취소/Escape는 요청하지 않으며, 확인은 닫힌 뒤 정확한 기존 bulk payload를 한 번 전송한다.
- 일괄 연결은 즉시 실행 잠금과 명시적 모달 상태를 확인한다. 요청 중 닫기를 금지하고 모달 본체로 초점을 이동하므로 두 버튼이 disabled인 때에도 Tab이 배경으로 빠지는 경로를 막는다.
- 일괄 연결 실패는 열린 모달 안의 `role=alert`에 표시되고 취소에 초점이 복귀한다. 재시도가 가능하며, 정상 결과 shape를 확인한 뒤 결과 집계와 trigger 초점으로 돌아간다. 실패를 성공으로 바꾸는 분기나 서버 응답 원문의 HTML 삽입은 없다.
- 새 client 잠금은 서버 권한의 대체물이 아니다. 기존 두 API의 `SUPER_ADMIN` 검사와 mutation 준비 경계가 유지된다. bulk-link의 필수 revision 0, 정확한 필드·후보 수·중복 후보 검사는 그대로다. 이번 변경에서 payload·DB·수집 정책을 수정하지 않았다.
- 단일 연결, 전체 동기화, 선택 동기화가 공유하는 `run()`에 동시 실행 가드가 추가됐으나 명령 endpoint와 기존 메시지 분기는 유지된다. 기존 요청별 idempotency key 발급 방식을 바꿨다고 주장하지 않는다.
- 새 합성 회귀는 두 모달의 초점·Escape·무요청 취소, 선택 동기화의 배경 handler/선택 고정/동일 tick 중복 확인, 일괄 연결의 pending·오류·재시도·성공을 직접 handler로 확인한다. 기존 check를 재실행할 새로운 실패 증거는 없었다.

## 통합 경계

Riot 관리자 page는 query action에 따라 `RiotAdminGlobalActions`와 `RiotAdminBulkLink` 중 하나만 렌더한다. MMR·대회 갤러리는 다른 route이므로 이 세 변경 때문에 두 body overflow 저장/복원이 같은 화면에서 겹치는 호출 구조는 없다. 확인창들은 서로 다른 title ID를 쓰며 같은 handler나 전역 상태를 공유하지 않는다.

MMR·Riot의 API·인증·도메인 transaction, 갤러리의 공개 DTO 범위를 변경하지 않았다. 새 client 경계로 전송하는 갤러리 값은 기존 공개 제목·이미지 URL·ordinal이다. 새 관리자 데이터 공개 경로는 발견되지 않았다. 전체 check의 기존 경고와 격리 DB 검증 결과는 해당 실행 근거로 관리하고 이 소스 검토 결과와 혼합하지 않는다.

## 남은 실제 확인 조건

- 최종 배포 빌드에서 직접 URL·열기·양방향 Tab·Escape·초점 복귀·작은 화면/긴 내용·뒤로 가기를 root의 실제 UI 근거와 연결할 것. VM fake DOM의 성공만으로 브라우저 통과라고 쓰지 않는다.
- 이 검토는 실제 보조기기·모바일 실기기·신규 방문자 관찰을 실행하지 않았다. native dialog 지원과 focus/스크롤의 실제 기기별 차이는 이 범위 밖이다.
- 운영 Riot 작업을 임의 실행하지 않았다. 실제 부분 반영 진단 저장은 [운영 읽기 관측](mmr-post-transition-operating.md)에 있지만 외부의 잘못된 경기 응답 복구나 모든 경기의 완전 수집을 입증하지 않는다. 실제 RSO·카카오 기기/방·OCR 정확도 등 외부 조건은 기존 미확인 원장에 남긴다.
- 다음 자연 MMR 예약의 HTTP 200과 불변 generation·대기 0은 코드상 IDLE 경로와 일치한다. 응답 본문 IDLE을 직접 읽었다거나 이후 모든 예약을 확인했다고 표현하지 않는다.

## 검토한 제품 파일 snapshot

아래는 이 검토 시점의 파일 바이트 SHA-256이다. 향후 같은 파일에 의미 있는 수정이 생기면 해당 변경을 다시 검토한다.

| 파일 | SHA-256 |
|---|---|
| `src/components/riot/riot-admin-actions.tsx` | `ac66df45654e9e403dfe5b7789dc19f8a924c5e98695b4dbe2fc23b2dbb08b4a` |
| `src/app/(admin)/admin/balance-ai/mmr-admin-actions.tsx` | `af39d3a26fb17dc9e383817f496a6ac4805cc1bd1055daa9fb55bb5ee76375dc` |
| `src/app/(public)/(competitions)/competitions/destruction/[tournamentId]/gallery-lightbox.tsx` | `a6c540e13fa8c516715d8e02ceaecc8831d6f2d0d436d437928061f3d9361442` |

## 이후 격리 UI에서 발견한 시험 환경 문제

위 모달 검토 뒤 loopback MMR 재계산에서 409가 발생했다. [별도 진단](isolated-mmr-fixture-diagnostic.md)에서 PostgreSQL의 generation 2 unique 충돌과 공유 destruction fixture의 GLOBAL generation 역행을 확인했다. 제품 모달·운영 전환 실패로 분류하지 않았다. fixture만 원상 복원하도록 수정하고 전체 row·최신 generation 일치 회귀를 추가했다. focused lint/diff 검사는 통과했으며 새 순차 DB·실제 UI 재검증은 root의 후속 실행 근거로 판정한다.
