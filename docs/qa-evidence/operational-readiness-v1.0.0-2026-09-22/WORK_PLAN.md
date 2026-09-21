# 운영 준비 보완 1.0.0 작업 현황

- 사용자 승인: 2026-09-22 현재 운영 중인 서비스의 잔여 사항 패치 및 운영 적용.
- 시작 소스: `04fee42ab54a527a42554340b579d5e402af597b`, `feat/kakao-v4-gateway-20260910`.
- 시작 운영: `kakao-copy-reliability@1.0.1`, source `b7798363f9b0caee847a654afe2dde07afbcb2f9`, deployment `dpl_Enu7zPFs7kr4pqUpiveAhB7BKXDJ`.
- DB 시작 head 기록: `0041_clever_skullbuster`. 배포 전 현재 head·hash를 재확인한다.
- 원격 main: `b4d56f58a761409995a1940513ff9c603e1c0282`. 오래된 main을 재배포하지 않는다.
- 운영 명단·회원·권한·기존 콘텐츠를 테스트 목적으로 임의 변경하지 않는다. 외부 기기 설치와 실계정 동의는 실제 확인 전 미확인으로 유지한다.

| ID | 범위 | 담당 | 상태 | 완료 조건 |
|---|---|---|---|---|
| O01 | 경기 변경 후 통계 자동 소비·재시도·관측 | release_evidence_audit | 운영 적용·예약 실행 확인 | no-season 이벤트 4건 소비·receipt 일치. 공개 시즌 재계산은 합성 DB 검증 |
| O02 | ADR0011 파티 전체 목록·직접 상세·초안 취소·저장 후 목록 | remaining_scope_audit | 운영 적용 | 99건 목록·직접 상세·scope·초안 취소·R24 호환 검증. 실제 폰 복붙은 별도 |
| O03 | 사이트 충원 카카오 전달·회원 연결 구분 | site_kakao_notifications | 서버 적용·알림 OFF | 큐/권한/대상/재시도/만료 DB PASS. 0.7.29a companion 설치·등록·실수신 필요 |
| O04 | 예약 작업 설정·실패 관측·복구 드릴 | 총괄 | 코드·예약·논리 복원 확인 | 실제 backup 복원 PASS, cron 실행 확인. 제공자 경보 수신/PITR 미검증 |
| O05 | Riot·Blob 실제 경계 검증 | 총괄 | Blob PASS·Riot 외부 설정 대기 | 후보·운영 Blob 네 단계 PASS. Riot 자격·실계정 동의 부재로 OFF |
| O06 | 팀 밸런스 보조 데이터 공급·관측 | 총괄 | 운영 코드 적용 | 팀 전용 보정·PUBLISHED 경력 집계·최신 Riot 요약 조건 검증. 실제 Riot 공급 OFF |
| O07 | 배포 기준·계약·런북·릴리스 정합성 | 총괄 | 릴리스 근거 연결 | source c5cbbcd8, DB0044, 기능별 1.0.0, registry·한국어 공지 |
| O08 | 통합 QA·배포·운영 smoke | 총괄 | 운영 적용·검사 PASS | 전체 check, DB139, 인증HTTP, 105페이지/339화면, GitHub CI, 후보·운영 읽기/Blob |

## 파일 소유

- 통계 module와 통계 신규 route/tests: O01 담당.
- recruiting dispatcher·파티 formatter·파티 domain/commands 및 postgres-kakao-assistant의 파티 조회 부분: O02 담당.
- seasons module/UI와 신규 알림 module·phone transport/tests: O03 담당.
- 공유 schema·migration journal·vercel.json·package·릴리스 등록부와 총괄 문서: 총괄 조정 후 수정.

## 현재 검증 상태

작업 시작 시 clean tree와 원격 branch/main SHA를 확인했다. 서버 패치·DB migration·운영 배포·검사를 수행했다. [최종 근거와 외부 미확인 범위](README.md)를 기준으로 하며, 휴대폰 설치·Riot 실계정·경보/PITR은 서버 배포 완료에 포함하지 않는다.
