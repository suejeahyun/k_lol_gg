# 서비스 후속 1.0.7 검증·배포 근거

2026-10-07 운영 반영을 확인했다. source `0716a60bf09654118cc40493481839d75269b3f7`, tag `service-completion-v1.0.7`, main `dpl_73cLhShUqRnR9WcramzRNwDQRdAv` READY다. 운영 주소는 https://k-lol-gg.vercel.app 이며 immutable URL은 https://k-lol-hwn3vw5c1-tjdmswo11-3715s-projects.vercel.app 이다. [provider·health 근거](production-deployment.json).

[전체 원장과 수정 이유](README.md), [Riot 원인·회귀](riot-partial-diagnostics.md), [독립 재검토](riot-independent-review.md), [홈 이름](home-ranking-names.md).

## 확인된 통합 결과

- [필수 check](check-final.log) exit0: 계약601 PASS, 단위1065 PASS/조건부skip1, lint0오류·기존58경고, typecheck·ERD·생성 이미지68개·최적화 빌드 통과.
- 별도 담당은 실제 body stream 지연과 동시429/성공 응답의 독립 회귀에서 발견한 timeout 오분류를 수정 후 같은 조건으로 재검증했다. 2조건 PASS이며 실제 제공자 지연/부하 측정은 아니다.
- 실제386경로·1141조작 소스 위치와 기존6예약 정의를 재대조했다. 개별 버튼의 모든 상태를 브라우저에서 실행했다고 세지 않는다.
- 필수 check 뒤 QA 시드/연결 정리 문제를 보완했다. 해당 실제 함수 회귀는 수정 전 2 FAIL/1 PASS에서 수정 후 3 PASS이며, 변경 파일 lint와 최종 typecheck도 통과했다. 전체 check의601/1065에 이 후속3건을 합산하지 않는다.
- [새 격리 PostgreSQL 최종 재실행](v107-browser-final-retry-database.log)은 fresh/upgrade·Riot 진단 저장/관리자 읽기·공개 DTO 경계를 포함해 통과했다. 브라우저 검증 완료 후 pool/cluster 종료와 임시 경로 제거, 하니스 exit0을 확인했다. [첫 실행](database-contracts-first.log)의 QA 준비 실패를 제품 오류나 통과로 바꾸지 않았다.
- [로컬 HTTP](page-http-final.json): 108페이지179조건, 실패0. [실제 렌더](home-names-after.json): 폰트 로딩 후320/390/768/1280px에서16자 합성 이름3개가 잘리지 않고 가로 넘침·이름/수치 겹침 없이 표시되며2·3위 하단 수치가 정렬됐다. [320px 화면](home-names-after-320.png). 실제 기기 또는 캐러셀 클릭 검증은 아니다.

## 실제 배포·운영 확인

CLI 후보 `dpl_2AtaxyjrMir9CJEzsem1ZF3Afh4x`의 정확한 source/READY를 provider API로 확인하고 [4개 익명 읽기 검사](candidate-http.json) 후 [운영 승격](promote-cli.log)을 완료했다. branch/main/tag atomic push 뒤 같은 source의 main 자동 배포 READY와 canonical alias를 확인했다. 초기 결과 판독은 병렬 curl 두 개가 종료되기 전에 시도해 status가 없었으므로 실패했으며, 요청 종료 exit0 뒤 네 실제 응답을 판독했다. 이를 제품 실패 또는 재시도로 숨기지 않는다.

[운영 HTTP31조건](production-http.json)은 홈 순서·로그인 복귀·MMR·랭킹·익명 권한 경계를 통과했다. [운영 실제 홈320/390/768/1280px](production-home-layout.json)은 로딩 후 폰트·이름 전체 표시·가로 넘침·겹침·2/3위 수치 정렬을 확인했다. [모바일](production-home-320.png), [PC](production-home.png). 후보 승격과 동일 source의 main 승격 사이에 확인한 항목이며, main READY 후 health도 별도로200/ready를 확인했다. 운영 회원 자료는 시험 변경하지 않았다.

최종 source 읽기 독립 검토는 [독립 검토](riot-independent-review.md)에 기록했다. 새로운 중대 문제나 명확한 과업 차단은 발견되지 않았고, 실제 제공자·실기기 확인을 대신하지 않는다. 배포 후 자연 예약 작업의 새 진단 저장 여부는 아래 후속 운영 관측으로 분리한다.

[배포 후 별도 담당자의 공개 GET3경계](post-deploy-independent.md)는 실제 홈 참조 CSS 제공·계정 화면의 스트리밍 로그인 이동·소유자 API401을 확인했다. 최초307-only 검사 오류와 실제 응답/설치된 Next 규약에 따른 원인도 보존했다. 통합 담당자는 추가로 [실제 브라우저 계정 이동](production-riot-redirect.json)이 `/login?next=%2Faccount%2Friot`에서 완료되고 로그인 폼을 표시함을 확인했다. 인증을 완료하거나 소유자 화면을 검증한 것으로 세지 않는다.

[자연 예약 동기화 후속 관측](riot-post-deploy-readonly.md): main alias13:01:17KST 이후 새로 요청된 JOB1건이13:05:46에 SUCCEEDED로 완료됐다.13:06:09의 읽기 전용 snapshot에서 PARTIAL0·미지코드0이다. 새 부분 성공 진단의 운영 저장 사례는 관측되지 않았으므로 격리 DB 통과와 구분한다. 운영 DB 쓰기·수동 Riot API 호출 없이 확인했고 READ ONLY/ROLLBACK을 완료했다. 과거19건의 원인을 소급 복원하거나 전체 연결 계정의 수집 완료로 확대하지 않는다.

## 복구 기준

새5xx·주요 이용 흐름 차단·권한 회귀·동기화 자료 손실/호출 증가가 확인되면 직전1.0.6 `dpl_A9a7KUgUdaYdQe9S5vtM7sKSWyMX` / `0277c327cb9054ef78ca2646982d0833e234f4db`를 재승격하고 health와 영향 경로를 다시 확인한다. 이번 변경은 migration0047과 기존 저장 필드를 유지하며 운영 회원 자료로 시험하지 않는다.

## 미확인 경계

실제 SUPER_ADMIN 로그인 없이는 MMR 운영 전환을 진행할 수 없다. 브라우저 native confirm 뒤의 입력 제약 때문에 참가 취소/재신청과 최종 관리자 일부 클릭 과업도 남는다. 실제 카카오 기기/방·RSO 소유자 승인·실기기 설치/스크린리더·신규 사용자 관찰·실제 OCR 정확도·장시간 부하·provider PITR/Blob 전체 복원은 기존 외부 조건과 구분하여 기록한다. 과거 PARTIAL19건의 원인은 보존되지 않아 소급 복원할 수 없다.

통과한 소스/격리/운영 확인 범위와 미확인 조건을 합쳐 전체 완료로 선언하지 않는다.
