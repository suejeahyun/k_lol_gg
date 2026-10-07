# 서비스 후속 1.0.7 검증·배포 근거

아직 운영 배포 전이다. 소스·검증·배포 상태를 분리하며 실제 SHA·deployment·health와 통합 결과를 확인 후 기록한다.

[전체 원장과 수정 이유](README.md), [Riot 원인·회귀](riot-partial-diagnostics.md), [독립 재검토](riot-independent-review.md), [홈 이름](home-ranking-names.md).

## 확인된 통합 결과

- [필수 check](check-final.log) exit0: 계약601 PASS, 단위1065 PASS/조건부skip1, lint0오류·기존58경고, typecheck·ERD·생성 이미지68개·최적화 빌드 통과.
- 별도 담당은 실제 body stream 지연과 동시429/성공 응답의 독립 회귀에서 발견한 timeout 오분류를 수정 후 같은 조건으로 재검증했다. 2조건 PASS이며 실제 제공자 지연/부하 측정은 아니다.
- 실제386경로·1141조작 소스 위치와 기존6예약 정의를 재대조했다. 개별 버튼의 모든 상태를 브라우저에서 실행했다고 세지 않는다.
- 필수 check 뒤 QA 시드/연결 정리 문제를 보완했다. 해당 실제 함수 회귀는 수정 전 2 FAIL/1 PASS에서 수정 후 3 PASS이며, 변경 파일 lint와 최종 typecheck도 통과했다. 전체 check의601/1065에 이 후속3건을 합산하지 않는다.
- [새 격리 PostgreSQL 최종 재실행](v107-browser-final-retry-database.log)은 fresh/upgrade·Riot 진단 저장/관리자 읽기·공개 DTO 경계를 포함해 통과했다. 브라우저 검증 완료 후 pool/cluster 종료와 임시 경로 제거, 하니스 exit0을 확인했다. [첫 실행](database-contracts-first.log)의 QA 준비 실패를 제품 오류나 통과로 바꾸지 않았다.
- [로컬 HTTP](page-http-final.json): 108페이지179조건, 실패0. [실제 렌더](home-names-after.json): 폰트 로딩 후320/390/768/1280px에서16자 합성 이름3개가 잘리지 않고 가로 넘침·이름/수치 겹침 없이 표시되며2·3위 하단 수치가 정렬됐다. [320px 화면](home-names-after-320.png). 실제 기기 또는 캐러셀 클릭 검증은 아니다.

## 복구 기준

새5xx·주요 이용 흐름 차단·권한 회귀·동기화 자료 손실/호출 증가가 확인되면 직전1.0.6 `dpl_A9a7KUgUdaYdQe9S5vtM7sKSWyMX` / `0277c327cb9054ef78ca2646982d0833e234f4db`를 재승격하고 health와 영향 경로를 다시 확인한다. 이번 변경은 migration0047과 기존 저장 필드를 유지하며 운영 회원 자료로 시험하지 않는다.

## 미확인 경계

실제 SUPER_ADMIN 로그인 없이는 MMR 운영 전환을 진행할 수 없다. 브라우저 native confirm 뒤의 입력 제약 때문에 참가 취소/재신청과 최종 관리자 일부 클릭 과업도 남는다. 실제 카카오 기기/방·RSO 소유자 승인·실기기 설치/스크린리더·신규 사용자 관찰·실제 OCR 정확도·장시간 부하·provider PITR/Blob 전체 복원은 기존 외부 조건과 구분하여 기록한다. 과거 PARTIAL19건의 원인은 보존되지 않아 소급 복원할 수 없다.

통과한 소스/격리/운영 확인 범위와 미확인 조건을 합쳐 전체 완료로 선언하지 않는다.
