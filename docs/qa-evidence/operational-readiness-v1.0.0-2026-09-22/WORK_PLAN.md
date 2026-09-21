# 운영 준비 보완 1.0.0 작업 현황

- 사용자 승인: 2026-09-22 현재 운영 중인 서비스의 잔여 사항 패치 및 운영 적용.
- 시작 소스: `04fee42ab54a527a42554340b579d5e402af597b`, `feat/kakao-v4-gateway-20260910`.
- 시작 운영: `kakao-copy-reliability@1.0.1`, source `b7798363f9b0caee847a654afe2dde07afbcb2f9`, deployment `dpl_Enu7zPFs7kr4pqUpiveAhB7BKXDJ`.
- DB 시작 head 기록: `0041_clever_skullbuster`. 배포 전 현재 head·hash를 재확인한다.
- 원격 main: `b4d56f58a761409995a1940513ff9c603e1c0282`. 오래된 main을 재배포하지 않는다.
- 운영 명단·회원·권한·기존 콘텐츠를 테스트 목적으로 임의 변경하지 않는다. 외부 기기 설치와 실계정 동의는 실제 확인 전 미확인으로 유지한다.

| ID | 범위 | 담당 | 상태 | 완료 조건 |
|---|---|---|---|---|
| O01 | 경기 변경 후 통계 자동 소비·재시도·관측 | release_evidence_audit | 구현 중 | bounded 인증 job, 중복·실패·수정/무효화/복구 수렴, 운영 실행 증거 |
| O02 | ADR0011 파티 전체 목록·직접 상세·초안 취소·저장 후 목록 | remaining_scope_audit | 구현 중 | 21건 이상, scope/운영일, DRAFT·멱등 취소, R24 호환 |
| O03 | 사이트 충원 카카오 전달·회원 연결 구분 | site_kakao_notifications | 설계·구현 중 | 안전한 전달 대상 연결, 큐·중복·재시도, 폰 설치본과 합성 검증 |
| O04 | 예약 작업 설정·실패 관측·복구 드릴 | 총괄 | 조사 중 | 현재 설정/로그, 복원 검증, 운영 job 기록 |
| O05 | Riot·Blob 실제 경계 검증 | 총괄 | 조사 중 | 구성 확인, 합성 전용 자산 왕복, 실계정 필요한 범위 분리 |
| O06 | 팀 밸런스 보조 데이터 공급·관측 | 총괄 | 조사 중 | 실제 원천을 연결하거나 미제공 상태/선행조건 명시; 값 추정 금지 |
| O07 | 배포 기준·계약·런북·릴리스 정합성 | 총괄 | 대기 | 현재 코드·tag·migration·배포·QA 연결 및 한국어 공지 |
| O08 | 통합 QA·배포·운영 smoke | 총괄 | 대기 | check/DB/HTTP/브라우저·보안, backup, 후보 검증, alias 전환 후 확인 |

## 파일 소유

- 통계 module와 통계 신규 route/tests: O01 담당.
- recruiting dispatcher·파티 formatter·파티 domain/commands 및 postgres-kakao-assistant의 파티 조회 부분: O02 담당.
- seasons module/UI와 신규 알림 module·phone transport/tests: O03 담당.
- 공유 schema·migration journal·vercel.json·package·릴리스 등록부와 총괄 문서: 총괄 조정 후 수정.

## 현재 검증 상태

작업 시작 시 clean tree와 원격 branch/main SHA를 확인했다. 구현·테스트·운영 적용은 아직 완료되지 않았다.
