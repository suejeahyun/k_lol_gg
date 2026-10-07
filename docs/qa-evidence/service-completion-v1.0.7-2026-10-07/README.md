# 서비스 후속 재검토 · 1.0.7

1.0.6 운영 source `0277c327cb9054ef78ca2646982d0833e234f4db`, 문서 HEAD `754244d4976398b94955bb302c62bd96aa05c328`에서 이어진 후속 검토다. 1.0.6의 완료된 결과는 덮어쓰지 않는다. 실제 배포 판정은 [production](production.md)을 따른다.

## 목적·범위와 새 발견

참가·모집·팀·기록·공유·관리의 기존 구조를 유지하고, 실제 운영 확인에서 발견한 식별·진단 공백을 해결한다. 새 기능이나 제공자를 추가하지 않는다.

| 중요도 | 발견 | 원인·해결 | 검증 근거 |
|---|---|---|---|
| P3 | 320px 홈 2위 이름이 말줄임되어 터치에서 전체 식별 어려움 | 홈 CSS의 이름/보조ID 공통 nowrap·ellipsis. 이름만 줄바꿈하고 카드 높이·수치를 정렬 | [실제 수정 전 측정](home-names-before.json), [표시·합성 시드](home-ranking-names.md) |
| P2 운영 진단 | Riot PARTIAL19건의 세부 원인 확인 불가 | 성공 처리 때 failure_code=null. 기존 저장/감사 필드에 유한·비식별 원인 저장; 회원은 한국어 표시 | [운영 원인 조사](../service-completion-followup-2026-10-07/riot-partial-readonly.md), [구현·회귀](riot-partial-diagnostics.md) |
| P2 | 응답 본문 수신 timeout을 형식 오류로 분류 | JSON 읽기 내부 catch가 abort를 가림. 같은 요청 시간 초과 분기로 처리 | [독립 재현/재검토](riot-independent-review.md) |
| P3 | 실제 Riot 연결 방식이 확인 필요로 표시 | 표시 사전의 값이 실제 domain enum과 불일치. 실제 값·기존 별칭 매핑과 미지값 복구 | [실제 소유자 SSR](riot-partial-diagnostics.md) |

부분 성공은 이미 얻은 랭크·자료를 유지한다. 첫 관측 원인 하나만 저장하며 과거19건을 소급 복원하거나 모든 원인이 해결됐다고 주장하지 않는다. 429 우선·요청 시간 예산·동시성·재시도 한도·개인정보 경계·DB migration은 유지한다.

## 전체 기능 원장 연결

[현재 개별 경로·조작 위치](interface-inventory.json)는 실제386경로와1141개 UI 조작 소스 위치를 기록한다. [경로/HTTP method/예약 대조](inventory-reconciliation.json)는 이전과 차이가 없다. 조작 소스 위치 수는 모두 실제 클릭한 수가 아니다.

순서별18개 기능군의 현재 결과와 남은 범위는 [1.0.6 전체 원장](../service-completion-followup-2026-10-07/README.md) 및 연결된 개별 기능 원장에 유지한다. 이번에는 01홈과15Riot를 변경하고17운영 진단을 보완한다. 나머지는 기존 결과와 이번 공통 검사 범위를 구분한다. 최신 버전이란 이유만으로 기능을 추가하거나 실측 근거 없는 성능 개선을 하지 않았다.

## 통합 검증 경계

필수 check는 계약601/단위1065 PASS·조건부skip1, lint0오류/기존58경고, 타입·ERD·생성 이미지·production build로 통과했다. 새 격리 DB, 실제 렌더와 운영 확인은 [production](production.md)에 이어 기록한다. 기존 인증 HTTP·실제 관리자 저장 과업은 1.0.6 근거로 연결하며 오늘 다시 실행한 항목과 섞지 않는다.

MMR 실제 최고관리자 로그인, native confirm 도구 복구 후 미완료 조작, 카카오/RSO/실기기/실제 OCR/외부 복구 등 조건은 여전히 별도다. 제품 수정이 가능한 진단 공백을 외부 권한 부족으로 분류하지 않았다.
