# service-completion 1.0.9 운영 반영

확인 시각 2026-10-08 KST. 핵심 과업의 기존 구현을 보존하고 관리자 목록 접근·조건 유지·정렬 표시, 확인창/이미지 확대 키보드, 모바일 필터를 수정했다. 홈 여섯 영역 순서·단일 랭킹 슬라이드·생성 이미지·배경·migration0047은 유지했다. 기능 추가·외부 서비스·의존성 교체는 필요하지 않았다.

## 소스와 배포

- source `c080ffba15dcc3f63e64242df87b31378bd63fa9`, tag `service-completion-v1.0.9`.
- 후보 `dpl_BfxQ567THe7aNdixf5B2G1EY78qf`: READY·동일 Git SHA와 health/홈 순서/랭킹/관리자401 확인 후 승격.
- main `dpl_AywtKdM1BhGGqj6WMnXBZmcyBpv3`: READY·동일 Git SHA·canonical alias·health ready 확인.
- 운영 [K-LOL.GG](https://k-lol-gg.vercel.app), [immutable main](https://k-lol-6scommn9p-tjdmswo11-3715s-projects.vercel.app).
- branch/main/tag 원자적 push 성공. [후보 검증](candidate-http.json), [최종 배포](production-deployment.json), [운영31조건](production-http.json). 31조건은 승격 뒤 동일 소스의 운영 주소를 검사한 것이며 최종 main READY 뒤 health를 다시 확인했다.

## 검증과 결과

전체386경로·1200조작 위치와18기능군은 [원장](README.md)에 연결했다. 최종 check 계약657 PASS·단위1068 PASS/skip1·타입·ERD·아트68·빌드 PASS, lint0오류/기존58경고. 새 격리 PostgreSQL·복원·인증 HTTP, 최종108페이지179조건, 전체 Git 이력/최종 tree 비밀정보 검사 통과. DB fixture GLOBAL 복원 결함을 고쳤으며 제품 DB와 구분했다.

[실제 과업](browser-final.md)에서 MMR4→5 재계산→6 수동 조정·새로고침, 두 대회13개 합성 기록의 필터/페이지/복구, 챔피언 검색 유지·초기화, 감사/AI 탭 문맥 유지, 징계 빈 페이지 복귀를 확인했다. 최초 관리자24화면폭 조건 중 대회320px 두 조건의 카드 넘침을 발견해 수정했고 최종 두 화면×네 폭8조건 모두 카드/문서 안에 들어왔다. [앞선 갤러리·확인창 실제 조작](browser-verification.md)과 각 구현자가 아닌 담당의 [교차검토](admin-pagination-independent-review.md)를 별도 근거로 남겼다.

운영 공개 대회 목록·완료 상세·갤러리 빈 상태도 실제 읽기로 확인했다. 운영 완료 대회에는 게시 갤러리가0개여서 새 확대창의 운영 이미지 조작은 확인할 수 없었다. 격리 실제 PNG 게시·연결·확대·키보드·네 폭 결과와 구분한다.

## MMR 운영 작업

실제 SUPER_ADMIN 로그인 후 최신 영향 분석·143099592byte 백업·격리 복원을 검증하고 정식 재계산을 한 번 실행했다. V1 generation1→V2 generation2,47회차/104게임, 대기13→0, 순수 계산과 저장 결과20조건 일치. 구 generation/원장 보존과 다음 자연 cron HTTP200·상태 불변을 확인했다. [전환 근거](mmr-transition.md), [자연 운영 관측](mmr-post-transition-operating.md). 운영 회원·신청·경기를 시험 자료로 변경하지 않았다.

## 남은 조건과 후속 발견

배포 후 관리자 페이지 새로고침에서 유효한 인증이 없어 로그인 화면으로 돌아왔다. 최고관리자 재로그인을 요청했으며 MMR/Riot 수정 확인창·관리자 목록의 **운영 재조작은 대기**다. 로컬 통과를 운영 클릭 통과로 바꾸지 않는다.

운영 재검토에서 과거 완료 대회의 확정 진출팀과 V2 계산 순위가 다른 P2 표시 문제를 추가 발견했다. V1은 세트득실 등을 표시 순위에 사용하고 본선4팀을 운영자가 선택했으며, import는 원래 확정 대진을 보존한다. V2는 현재 UUID 동률 정렬을 최종 순위로 표시해 조별1·3행이 진출하는 모순을 만들었다. 확정 대진·본선 결과는 일치하므로 운영 데이터 수정 근거가 없다. 별도1.0.10에서 기록과 확정 진출 표시만 수정한다. 이 발견이 해소되기 전 전체 완료를 선언하지 않는다.

기존 native confirm 도구 정지 이후 최종 경기 승인·별도 취소/재신청 실제 클릭, 카카오 실기기/방 ACK·설치, Riot RSO 소유권/설정, 실제 OCR·OS 설치·스크린리더·처음 방문자 관찰·장시간 부하·provider PITR/Blob 전체복원은 미확인이다. 계약/대역/격리 검증과 구분한다. 기존 lint58경고와 개발 도구 감사12건도 이 버전에서 해결했다고 주장하지 않는다.

## 복구 기준

핵심 공개 화면 오류·새 권한 노출·저장/페이지 차단·화면 회귀가 발생하면 원인과 범위를 확인하고 직전1.0.8 `dpl_BTfa4hYSa6ZR19K4Lfszsu88Lhr2`(https://k-lol-5ajghfd47-tjdmswo11-3715s-projects.vercel.app)로 Vercel 승격 복구 또는 검증된 forward fix를 적용한다. DB 스키마 변경은 없다.

Vercel 복구는 이미 정식 게시된 MMR generation2를 되돌리지 않는다. 해당 전환의 DB 복구는 보존된 백업과 별도 검증/운영 결정이 필요한 경계이며 현재 정상 데이터를 임의 복원하지 않는다. 실제 provider PITR·Blob bytes 전체 복원을 검증한 것으로 표시하지 않는다.
