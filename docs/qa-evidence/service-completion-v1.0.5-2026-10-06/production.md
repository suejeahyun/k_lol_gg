# 서비스 과업·저장 복구 1.0.5 운영 반영

- source: `c9431b9e68b468c17d02c6ff7595de7e14a7c9c8`
- tag: `service-completion-v1.0.5`
- Vercel main: `dpl_HuMGR69n3o964U2CnZZicYHCKhW7`, READY
- immutable: https://k-lol-hhf457dov-tjdmswo11-3715s-projects.vercel.app
- 운영: https://k-lol-gg.vercel.app
- migration: `0047_usage_analytics` 유지. 운영 회원·신청·경기·스키마의 시험 변경 없음.

## 목적성과 전체 점검

참가·모집 → 팀 만들기 → 경기 접수·검토 → 기록·공유라는 기본 과업과 관리자 운영 기능은 기존 구현에 있다. 이번에는 기능을 늘리지 않고 실제 저장·복구와 표시의 불일치를 고쳤다. [01–18 기능군 원장](coverage-gaps.md)은 실제 실행한 층위와 공백을 구분한다. [전체 경로 재대조](inventory-reconciliation.json)는108페이지·212API·63호환handler·3metadata 총386경로와6개cron의 추가·삭제·메서드 차이가 없음을 확인한다. 경로 수가 모든 사용자 상태 조합의 실행 수를 의미하지 않는다.

홈 여섯 영역의 순서, 한 슬라이드에서 선택하는 승률·최다 참여·최다 MVP, 생성 이미지·배경은 유지했다. 부가 설명을 새로 늘리는 대신 버튼·상태·복구 행동을 바로 표시했다. 입력 제약·정책·실제 상태·집계 기준은 보존했다. 새 기능·프레임워크·외부 공급자를 추가할 근거는 없었다. 측정된 [성능 표본과 한계](performance-review.md)에 따라 실행 지연 원인을 입증하지 못한 번들 최적화는 하지 않았으며 개선 수치를 주장하지 않는다.

## 발견과 수정

- **P2 팀 상태:** 수동으로 교체한 선수와 복사·접수에 쓰이는 선수가 달랐다. 실제 클립보드로 재현했다. 미평가 변경 상태를 표시하고 이전 팀 기반 행동을 잠근다. 되돌리기·평가·저장·복사·새로고침 후 선수 일치를 실제 확인했다. 로그인 뒤 초안의 선택 query도 보존한다.
- **P2 문의 처리:** 실제 관리 UI의 `rev-0` ETag가 서버 계약과 달라 상태·메모 저장이 거절됐다. 숫자 ETag를 공통 helper로 생성하고 요청 유실·중복·401·412·같은 revision의 명시적 초기화와 삭제 후 목록 이동을 보완했다. 관리 명칭을 문의·건의로 통일했다.
- **P2 이벤트 저장:** 같은 생성 요청의 동시 실행이201/503으로 갈라졌다. serializable40001/40P01만 최대3회 새 트랜잭션으로 재시도하며 권한·멱등 receipt·revision·감사/outbox 검사는 유지했다. 격리 DB와 실제 HTTP에서 한 번 저장과 replay를 확인했다.
- **P2 관리자 생성:** 이벤트·멸망전·징계·미디어의 응답 유실 후 새 요청/키 생성, 완료 이동 중 재제출, 오류 처리 누락을 보완했다. 미확정 요청은 동일 본문·키를 보존하고 입력을 잠그며 새 창 로그인으로 복구한다. 갤러리 부분 업로드 결과를 유지한다. 독립 재검토에서 찾은 잘린200JSON의 이미지 연결 성공 오표시도 유효한 revision 확인으로 고쳤다.
- **P2/P3 표시·접근성:** 낮은 포커스·순위 숫자 대비를 기존 디자인 token과 충분한 배지 색으로 개선했다. 입력 계약상 유효한 W16 이름이 모바일 승률과 겹치는 것을 실제 재현했고 기존 MMR의 줄바꿈 방식을 적용했다. 이름이나 Riot ID를 삭제·잘라 숨기지 않는다.

원인별 수정 전 실패와 수정 후 결과는 [QA 진입점](README.md), [독립 재검토](independent-review.md), [관리 생성 후속 검토](admin-create-independent-review.md)에 연결한다. 제품 오류와 잘못된 테스트 기대·도구 사용 오류를 분리했다.

## 실제 검증

- [최종 필수 check](check-final.log) exit0: 타입·ERD·생성 이미지·최적화 build, 계약556PASS, 단위1050PASS/조건부skip1. lint 오류0·기존경고58. [인증 HTTP](auth-http.log) 및 [전체 Git 이력 비밀정보 검사](secrets-history.log) 통과. 로그의 끝 공백만 정리했으며 실패·결과 내용은 유지했다.
- [새 PostgreSQL](completion-browser-final-database.log) fresh/upgrade·권한·집계·동시성·복원과 이벤트 확장 회귀 통과. 이후 랭킹 CSS 새 빌드용 [release fixture](completion-browser-release-database.log)도 정상 종료·cluster 중지·일회성 경로 정리를 확인했다. 재실행 수를 합산하지 않는다.
- [108페이지169조건](release-http.json) 조회·세션별 복귀·필터·서버 오류 검사 통과. 문의·멸망전·하이라이트·갤러리·징계 실제 인증 HTTP 저장/조회/충돌/복구는 [기능별 기록](coverage-gaps.md), 이벤트 새 빌드11응답은 [후속 결과](event-write-http-after.json)에서 확인한다. fake storage와 실제 제공자 왕복을 구분한다.
- [실제 브라우저](browser.md): 10명 선택→추천→저장→다시 열기(기준 빌드), 새 빌드의 RED추천 로그인 복귀·수동 교체 잠금→되돌리기→평가→실제 복사→저장→새로고침, 문의 접수와 저장 오류 재현, 합성 선수 이름 수정, 긴 이름 랭킹을 실행했다. 최종 랭킹은 [320/390/768/1280px](ranking-layout-after.json)에서 이름·수치 겹침/가로 넘침 없음, 상위 카드의 전체 이름 표시를 확인했다.
- 운영 [읽기 전용 HTTP31조건](production-service-http.json) 통과. 실제 홈 [네 폭 측정](production-layout.json)은 가로 넘침 없음·main 하나·영역 순서·로딩 완료 이미지 누락 없음이다. [운영 화면](production-home.jpg). 최초 viewport 설정이 다른 탭에 적용된 도구 오류는 실제 innerWidth assertion으로 검출했고 올바른 탭에서 재측정했다. 이것은 제품 오류가 아니며 잘못된 첫 측정은 통과 근거로 사용하지 않는다.
- 별도 담당의 [배포 후 독립 표본](post-deploy-independent.json)은 canonical health, 팀 추천 로그인 복귀의 정확한next, 실제 제공된 랭킹 CSS의 두 줄바꿈 규칙, 이벤트·문의 관리 API의 비인증401·데이터 비노출을 확인했다. 이 검토 범위에서 새 차단 결함은 발견하지 않았다. 실제 운영 로그인/쓰기나 도구로 막힌 브라우저 조작을 완료로 확대하지 않는다.

## 배포와 복구

clean source의 CLI 후보 `dpl_EruVkAN5Dn3LttC8gese1uyYn7hD` READY와 정확한source를 확인했다. [후보 검사](candidate-http.json)의 health·홈 순서·랭킹·비로그인 관리자 API401을 통과한 뒤 운영 승격, branch/tag/main push를 수행했다. 같은source의 Git main 배포가 READY와 canonical alias를 가진 것을 확인했다. [제공자 metadata와 health](production-deployment.json).

새5xx·주요 조회/저장 장애·권한 회귀가 확인되면 직전1.0.4 `dpl_61srgiX3pqpT8ZBygBHzPLj8S468` / source `583dab4d3793b1bb00de92c2ea2fd4ad21a2e04d`를 재승격하고 health와 해당 경로를 다시 확인한다. 이번 관측에서는 복구 기준에 해당하는 운영 회귀가 발견되지 않았다. 릴리스 등록과 후속 증거는 문서 전용 commit이며 source tag는 이동하지 않는다.

## 아직 완료하지 못한 항목

1. **로컬 브라우저 조작 제한:** 합성 참가 취소의 native confirm 뒤 도구의 입력·dialog 조회·기존 탭 닫기가 실패했다. 새 탭에서도 실제 입력 전송이 진행되지 않았다. 사용자에게 확인창/검증 탭 닫기를 요청했다. 참가 취소→재신청, 수정 후 문의 UI 저장, 관리자 생성/미디어/징계·경기 검토의 아직 실행하지 않은 UI 종료 과정은 완료로 표시하지 않는다. 이는 외부 권한 부족이 아닌 도구 복구 후 계속할 로컬 검증이다. handler·DB·HTTP 통과와 구분한다.
2. **MMR 운영 전환:** 실제 최고관리자 로그인 대기. 이전 읽기 전용 영향 분석·백업·격리 복원은 [전환 검토](../service-followup-2026-10-06/mmr-transition-review.md)에 있다. DB 자격으로 관리자 세션을 위조하지 않았고 기존 공식·미소비 변경 이벤트 문제를 이번 UI 릴리스로 해결했다고 하지 않는다.
3. **외부 조건:** Riot RSO 승인 client와 소유자 동의, 카카오 실제 설치 기기·허용 방의 송수신/백그라운드, 물리 기기·스크린리더·신규 이용자 관찰, 실제 OCR 정확도·장시간 최대 부하·외부 경보 수신·PITR/Blob 전체 복원은 별도 조건이 남는다. 의존성은 이번 변경이 없으며 기존 개발 도구 감사 경고12건도 미해결이다.

추가 수정이 필요 없다고 판단한 범위는 이번에 재현·수정하고 handler/DB/HTTP/실제 렌더 및 교차 검토한 경계다. 전체 과업의 완전한 종료나 모든 기기·외부 연동의 보장을 뜻하지 않는다. 확인되지 않은 항목을 덮기 위한 기능 추가나 같은 검사의 무의미한 반복은 하지 않는다.
