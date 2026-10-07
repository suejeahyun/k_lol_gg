# 관리자 표시·MMR 요청 복구 1.0.8 검증·배포

배포 전 기록이다. 현재 운영은1.0.7 source `0716a60bf09654118cc40493481839d75269b3f7`, `dpl_73cLhShUqRnR9WcramzRNwDQRdAv`이다.1.0.8의 source/tag/provider READY와 운영 확인은 완료 후 아래에 기록한다.

[문제·전체 기능 원장](README.md), [MMR 회귀](mmr-admin-recovery.md), [이벤트 표시](event-admin-display.md), [독립 재검토](independent-review.md), [이전 빌드 실제 조작 후속](../service-completion-interactions-2026-10-07/browser-journeys.md).

## 통합 검증

첫 필수 check는 lint0오류/기존58경고·타입·ERD 뒤 계약 검사에서1건 실패했다. 기존 bounded picker 테스트가 `busy || !playerId`라는 문자열을 요구했다. 실제 코드는 처리 중뿐 아니라 미확정 요청·갱신 중까지 포함한 `locked`로 확장되었으므로, 변수명 결합 검사와 실제 동작 검사를 구분한다. [첫 실행 로그](check-first.log)를 보존하며 후속 실제 버튼/fieldset 회귀와 전체 재실행을 기록한다. 기대값만 교체해서 제품 결함을 숨기지 않는다.

후속 actual-handler는 플레이어 미선택 시 제출0건, 선택 후 활성화, 처리 중 버튼/fieldset 잠금, 렌더 전 같은 submit 두 번에1건만 전송됨을 직접 확인한다. bounded picker endpoint/raw UUID 검사는 유지했다. [최종 필수 check](check-final.log) exit0: 계약613 PASS, 단위1068 PASS/조건부skip1, lint0오류/기존58경고, 타입·ERD·생성 이미지68개·최적화 빌드 통과.

[새 격리 DB 최종 로그](database-final.log)는 fresh/upgrade·인증/권한 HTTP·MMR 전체 원장 재생과 영수증·동시성 계약을 통과했다. [전체 페이지 HTTP](page-http-final.json)는108페이지179조건에서 실패0이었다. 하니스 종료 후 pool/cluster 종료·일회성 경로 제거·exit0을 확인했다. native confirm의 제어 도구 중단으로 변경 빌드의 실제 브라우저 조작·모바일·포커스는 아직 미확인이다. 기존 버전의 실제 클릭 결과나 handler 대역 검사를 새 빌드의 실제 UI 통과로 바꾸지 않는다.

## 배포·복구

운영 반영은 PENDING이다. 후보 source/READY 검증과 읽기 smoke 후 승격하고, main source/alias/health를 대조한다. 새5xx·관리 작업 차단·권한 회귀·이전 결과를 잘못 완료로 알리는 문제가 확인되면 직전1.0.7 배포 `dpl_73cLhShUqRnR9WcramzRNwDQRdAv`를 재승격하고 health와 영향 경로를 재검증한다. 이번 패치는 API·서버 권한·MMR 공식·migration0047을 변경하지 않는다. 이후 별도 운영 MMR 전환을 실행한다면 웹 배포 복구가 DB 계산 버전을 되돌리는 것은 아니며, 그 시점의 검증된 백업/전진 복구 절차를 별도로 따른다.

## 미완료 조건

운영 사용자가 로그인한 실제 역할은 ADMIN으로 확인되어 SUPER_ADMIN 전환은 미실행이다. 임의 권한 승격·세션 위조·운영 데이터 테스트를 하지 않았다. 최신 영향 분석과 백업 runner는 준비했지만 인증 전에 재실행하지 않았다.

로컬 native confirm에서 브라우저 도구가 멈춰 최종 경기 공개·참가 취소/재신청·접수 취소의 최종 확인 조작은 미완료다. 정상 처리의 중간 저장과 격리 HTTP/DB 결과를 해당 최종 클릭 통과로 간주하지 않는다. 실제 카카오 기기/방, RSO 승인, 실제 기기 설치·스크린리더·처음 방문자 관찰, 실제 OCR·장시간 부하·provider PITR/Blob 전체 복구도 기존 외부 조건으로 분리한다. 전체 완료를 선언하지 않는다.
