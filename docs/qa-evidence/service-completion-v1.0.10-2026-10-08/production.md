# service-completion 1.0.10 운영 반영

2026-10-08 KST. 과거 멸망전의 확정 진출팀과 현재 계산 순위가 충돌할 때만 공개 표를 ‘예선 경기 기록’으로 바꾸고 순위 열을 숨겼다. 본선 요약은 실제 확정 수를 표시한다. 신규 기능·계산·API·DB·권한·의존성 변경은 없다. 홈 여섯 영역 순서·단일 랭킹·생성 이미지·배경과 migration `0047_usage_analytics`를 유지한다.

## 배포 근거

- source `49f438ab3b2a2e1cf481d60e50d2806c658bcb25`, tag `service-completion-v1.0.10`.
- 후보 `dpl_8oSToz54JNgSQMTeLbPiAJRntktx`: READY·동일 source·health·홈 순서·랭킹·관리자401·수정 대회 표 확인 후 승격.
- main `dpl_6pakqNCz22PdtQ5a49MxttpntnZT`: READY·동일 source·canonical alias·health ready. 확인 시각 `2026-10-07T16:54:24.475Z`.
- [운영](https://k-lol-gg.vercel.app), [immutable main](https://k-lol-p9ivfmnf1-tjdmswo11-3715s-projects.vercel.app).
- branch/main/tag 원자적 push 성공. [후보 검증](candidate-http.json), [최종 provider·health](production-deployment.json), [운영31조건](production-http.json).

첫 업로드는 네트워크 `fetch failed`로 실패했다. provider 목록에 새 배포가 없고 기존 운영이 유지됨을 확인한 뒤 재시도했다. 후보 BUILDING 중의 HTTP200은 provider 대기 화면이어서 통과로 세지 않았고 READY 뒤 본문까지 확인했다. 후보 HTML 진출 개수 검사의 첫 정규식은 설명 문장까지 세어5를 반환했다. 실제 팀 행의 `th`만 세도록 검사를 고쳤고 제품은 바꾸지 않았다.

## 검증 범위

전체 필수 `npm run check` exit0: 계약660 PASS·단위1068 PASS/skip1, 타입·ERD·68이미지·최적화 빌드 PASS. lint0오류/기존58경고. 이번 소스/테스트/Markdown diff 공백 검사와 비밀정보 tree 검사가 통과했다. 원본 도구 로그의 줄 끝 공백은 그대로 보존했고 전체 로그 포함 diff의 공백 경고를 소스 오류로 세지 않았다. 전체 Git 이력 비밀정보 검사는 같은 세션1.0.9 결과를 재사용했다.

새 회귀는 실제 합성 aggregate→DTO→표/공개 Page를 실행한다. 불일치 기록의 오해 제거, 정상·미확정·진행 중 표시 유지와 aggregate/DTO 불변을 확인했다. 기존 gallery fixture의 필수 필드 누락은 시험 환경 오류로 분리하고 실제 DTO에 맞게 빈 배열을 보충했다. [원인과 수정 전후](qualification-display.md), [별도 담당자의 독립 검토](independent-review.md).

운영 실제 브라우저에서 동일 완료 대회의 ‘예선 경기 기록’, 두 조의 순위 열 제거, 확정 진출4개, ‘4팀 확정’ 및 기존 대진 표시를 확인했다. [320/390/768/1280 CSS 너비](public-responsive.json)에서 문서 가로 넘침0·표 컨테이너 범위·6개 열·진출4개를 관측했다. PC와320px 실제 캡처를 육안으로 확인했으며 가로로 긴 표는 내부 스크롤을 유지한다. 실기기나 모든 표의 키보드 조작을 새로 검증한 것으로 표시하지 않는다.

운영 공개 API를 배포 전후 GET한 [이전](public-record-before.json)/[이후](public-record-after.json) 해시는 같다. revision·상태·순위 원본·점수·예선/본선 경기·진출팀·우승 기록을 포함하며 원문/선수 식별자는 저장하지 않았다. 이 표시 수정으로 운영 자료를 변경하지 않았다.

## 전체 판단과 남은 조건

[전체 기능 원장](README.md)에108페이지·212 API·63 호환·3 metadata·6예약 작업과18기능군의 기존 근거를 연결했다. 이번 수정에는 새 경로나 과업 추가가 필요하지 않았다. 독립 소스 검토에서 이번 표시 수정의 새 중대/과업 차단 문제는 발견되지 않았다. 완료 대회의 비로그인 신청·MVP 안내는 별도 재검토 중이며 이 기록으로 전체 완료를 선언하지 않는다.

정식 MMR V2 전환은 직전 [운영 근거](../service-completion-final-2026-10-08/mmr-transition.md)대로 generation2·47회차104게임·대기0 및 다음 자연 cron까지 확인됐다. 관리자30분 세션 만료로 재로그인을 요청한 상태라 새 관리자 모달/페이지의 운영 재조작은 미확인이다. 로컬 통과를 운영 클릭 완료로 바꾸지 않는다.

기존 native confirm 도구 정지 이후 최종 경기 승인·취소/재신청 실제 클릭, 카카오 기기/방 ACK·설치, Riot RSO 외부 승인/설정, 실제 OCR·OS 설치·스크린리더·신규 사용자 관찰·장시간 부하·provider PITR/Blob 전체복원은 별도 조건이다. 기존 lint58경고와 개발 도구 감사12건도 미해결로 유지한다. 운영 회원 자료를 시험 변경하지 않는다.

## 복구 기준

공개 화면·권한·저장·대회 표시의 새로운 회귀가 확인되면 직전1.0.9 `dpl_AywtKdM1BhGGqj6WMnXBZmcyBpv3`(https://k-lol-6scommn9p-tjdmswo11-3715s-projects.vercel.app)로 승격 복구하거나 검증된 후속 수정을 적용한다. 스키마 변경은 없다. Vercel 복구는 이미 게시된 정상 MMR generation2를 되돌리지 않으며 DB 복구는 별도 검증/운영 결정이 필요한 경계다.
