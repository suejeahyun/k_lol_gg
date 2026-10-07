# 관리자 표시·MMR 요청 복구 1.0.8 검증·배포

2026-10-07 운영 반영을 확인했다. source `653023b0f8dd1640b42afebf5e1fa3e2c7a3bee6`, tag `service-completion-v1.0.8`, main `dpl_BTfa4hYSa6ZR19K4Lfszsu88Lhr2` READY다. 운영 주소는 https://k-lol-gg.vercel.app 이며 immutable URL은 https://k-lol-5ajghfd47-tjdmswo11-3715s-projects.vercel.app 이다. [provider·health 근거](production-deployment.json).

[문제·전체 기능 원장](README.md), [MMR 회귀](mmr-admin-recovery.md), [이벤트 표시](event-admin-display.md), [독립 재검토](independent-review.md), [이전 빌드 실제 조작 후속](../service-completion-interactions-2026-10-07/browser-journeys.md).

## 통합 검증

첫 필수 check는 lint0오류/기존58경고·타입·ERD 뒤 계약 검사에서1건 실패했다. 기존 bounded picker 테스트가 `busy || !playerId`라는 문자열을 요구했다. 실제 코드는 처리 중뿐 아니라 미확정 요청·갱신 중까지 포함한 `locked`로 확장되었으므로, 변수명 결합 검사와 실제 동작 검사를 구분한다. [첫 실행 로그](check-first.log)를 보존하며 후속 실제 버튼/fieldset 회귀와 전체 재실행을 기록한다. 기대값만 교체해서 제품 결함을 숨기지 않는다.

후속 actual-handler는 플레이어 미선택 시 제출0건, 선택 후 활성화, 처리 중 버튼/fieldset 잠금, 렌더 전 같은 submit 두 번에1건만 전송됨을 직접 확인한다. bounded picker endpoint/raw UUID 검사는 유지했다. [최종 필수 check](check-final.log) exit0: 계약613 PASS, 단위1068 PASS/조건부skip1, lint0오류/기존58경고, 타입·ERD·생성 이미지68개·최적화 빌드 통과.

[새 격리 DB 최종 로그](database-final.log)는 fresh/upgrade·인증/권한 HTTP·MMR 전체 원장 재생과 영수증·동시성 계약을 통과했다. [전체 페이지 HTTP](page-http-final.json)는108페이지179조건에서 실패0이었다. 하니스 종료 후 pool/cluster 종료·일회성 경로 제거·exit0을 확인했다. native confirm의 제어 도구 중단으로 변경 빌드의 실제 브라우저 조작·모바일·포커스는 아직 미확인이다. 기존 버전의 실제 클릭 결과나 handler 대역 검사를 새 빌드의 실제 UI 통과로 바꾸지 않는다.

## 배포·복구

후보 `dpl_CowR2S74wPx37H59eFxo9QFusndk`의 source/READY를 확인하고 [4개 익명 읽기 검사](candidate-http.json) 뒤 운영 승격을 완료했다. branch/main/tag atomic push 후 같은 source의 main READY·canonical alias·health를 확인했다. [운영 HTTP31조건](production-http.json)은 홈 순서·로그인 복귀·MMR·랭킹 집계·익명 권한 경계를 통과했다. 운영 회원의 자료를 시험 변경하지 않았다.

[첫 배포와 복구](deployment-attempts.json): 최초 CLI 요청은 Not authorized로 거절됐다. CLI 로그인·프로젝트 조회·팀 OWNER 권한을 확인한 뒤 같은 팀을 명시한 재시도가 성공했다. 최초 거절의 정확한 provider 원인은 확정하지 않았으며 권한/인증/보호 설정을 바꾸지 않았다. 후보 HTTP 최초 판독은 health curl 프로세스가 끝나기 전에 실행해 상태 값이 없었으므로 실패했고, 실제 exit0 뒤 네 응답을 판독해 통과했다. 제품 실패로 혼동하지 않는다.

[별도 배포 후 재검토](post-deploy-independent.md)는 공개 읽기·로그인 경계를 확인했다. 실제 인증된 관리자 화면 조작을 대신하지 않는다. 기존 실제 UI는 [1.0.7 빌드의 후속 조작](../service-completion-interactions-2026-10-07/browser-journeys.md)에만 기록했다. 새 빌드의 이벤트/MMR 실제 브라우저 렌더·모바일·포커스·저장 조작은 확인창 도구 제한으로 미확인이다.

복구 기준:  새5xx·관리 작업 차단·권한 회귀·이전 결과를 잘못 완료로 알리는 문제가 확인되면 직전1.0.7 배포 `dpl_73cLhShUqRnR9WcramzRNwDQRdAv`를 재승격하고 health와 영향 경로를 재검증한다. 이번 패치는 API·서버 권한·MMR 공식·migration0047을 변경하지 않는다. 이후 별도 운영 MMR 전환을 실행한다면 웹 배포 복구가 DB 계산 버전을 되돌리는 것은 아니며, 그 시점의 검증된 백업/전진 복구 절차를 별도로 따른다.

## 미완료 조건

배포 후 독립 검사 초기의 홈 제목 기대값과 로컬 CSS 파일명 가정은 QA 오류였다. 실제 운영 HTML이 참조하는 CSS는200이었다. 통합 담당자의 [제목 원인 대조](heading-qa-reconciliation.json)에서 운영 h1은 `우리 같이<span>롤하자~</span>`이며 소스와 정확히 일치한다. JSX 개행의 공백 제거와 span의 시각적 줄 구분을 단일 문자열 공백으로 가정한 검사였다. 초기 실패 결과를 보존하며, 확인한 원인을 제품 변경이나 기대값만 변경한 테스트로 숨기지 않는다. 실제 브라우저 배치 검증과는 별도다.

운영 사용자가 로그인한 실제 역할은 ADMIN으로 확인되어 SUPER_ADMIN 전환은 미실행이다. 임의 권한 승격·세션 위조·운영 데이터 테스트를 하지 않았다. 최신 영향 분석과 백업 runner는 준비했지만 인증 전에 재실행하지 않았다.

로컬 native confirm에서 브라우저 도구가 멈춰 최종 경기 공개·참가 취소/재신청·접수 취소의 최종 확인 조작은 미완료다. 정상 처리의 중간 저장과 격리 HTTP/DB 결과를 해당 최종 클릭 통과로 간주하지 않는다. 실제 카카오 기기/방, RSO 승인, 실제 기기 설치·스크린리더·처음 방문자 관찰, 실제 OCR·장시간 부하·provider PITR/Blob 전체 복구도 기존 외부 조건으로 분리한다. 전체 완료를 선언하지 않는다.
