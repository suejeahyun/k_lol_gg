# 1.0.3 404 경계 수정 — 독립 검토

2026-10-06 KST. 검토자는 1.0.2 배포 후 잘못된 접수 주소를 읽기 전용으로 확인하고 CUA 후속 확인을 요청했다. 실제 중복 화면 재현은 통합 담당자가 수행했으며, 이번 404 경계 수정은 별도 구현 담당자가 작성했다. 이 검토자는 404 수정 source나 운영 데이터를 쓰지 않았다. 이후 별도로 맡은 홈 랭킹 선택 UI의 구현은 이 문서의 독립 검토 범위에 포함하지 않으며 다른 담당자의 교차 검토가 필요하다.

## 판단

현재 수정 diff에서 새 중대 오류나 명확한 과업 방해 요소를 발견하지 못했다. 공개 layout과 root 404가 각각 SiteShell을 구성해 중복되는 원인에 맞춰 **틀은 현재 layout이 제공하고, 404 내용은 공유**하도록 분리했다. root 미일치 URL의 사이트 틀과 관리자의 기존 인증·레이아웃을 보존한다.

이 소스 검토는 1.0.2 운영의 중복 404 결함을 해결 완료로 표시하지 않는다. 최종 HTTP 회귀와 독립 렌더 검사는 아래와 같이 통과했다. 일반 브라우저의 렌더 확인, 필수 검사와 1.0.3 운영 배포·확인은 별도 실행 상태를 따른다.

## 변경과 경계 검토

| 대상 | 확인한 근거 | 판단 |
| --- | --- | --- |
| root `src/app/not-found.tsx` | 기존 SiteShell을 유지하고 그 안의 안내만 NotFoundContent로 분리 | 라우터가 전혀 찾지 못하는 URL도 헤더·푸터·본문/skip-link를 유지. root에서 무조건 틀을 제거해 미일치 주소를 빈 레이아웃으로 만드는 변경이 아님 |
| 공개 `src/app/(public)/not-found.tsx` | 내용만 반환. 부모 PublicLayout의 SiteShell이 이미 main/id/헤더/푸터를 제공 | 기존 공개 경로에서 notFound가 발생할 때 중복 SiteShell·main을 만들지 않음 |
| 관리자 `src/app/(admin)/admin/not-found.tsx` | main 하나와 공유 내용, 관리 홈/검색 복구 링크. AdminShell은 main을 생성하지 않음 | AdminLayout의 requirePageRole(ADMIN)·세션 전달을 유지하며 public shell을 안쪽에 추가하지 않음. 관리자 기존 화면과 복구 목적이 일치 |
| 공유 `src/components/not-found-content.tsx` | 기존 StatusPanel·404 문구·기본 홈/플레이어 복구 링크를 유지. children이 있으면 관리자 복구 링크 사용 | 공통 UI를 중복 구현하지 않으며 데이터 조회·권한·mutation을 새로 추가하지 않음 |
| 기존 더 가까운 경계 | media image/highlight, admin player/image/highlight/champion 편집의 기존 not-found 파일 유지 | 기존 업무별 안내와 복구 링크를 광범위하게 대체하지 않음. 회귀에서 admin player 경계의 등록부 링크를 별도로 확인하도록 구성 |
| 루트·문서 landmark | RootLayout 자체는 html/body와 공통 효과/PWA/도우미만 제공. PublicLayout은 SiteShell의 main을, AdminShell은 layout만 제공 | 공개 경계는 별도 main 없이, 관리자 경계는 main 하나로 구성하는 차이가 실제 부모 구조와 일치 |
| 인증·입력·집계 | 로그인/세션/owner API/요청 scope/hash/receipt/DB/집계 소스는 이 패치에서 변경하지 않음 | 1.0.2의 접수 권한 수정이나 MMR 정책을 우회하는 경로 없음. 동적 관리자 미존재 주소의 익명 login redirect를 HTTP로 검증하도록 구성 |

## 검증 설계와 실제 상태

`verify-match-public-http.ts`에 Next 실제 서버의 경계 선택을 확인하는 회귀가 추가됐다. 공개 invalid submit, 없는 player/match, unmatched root URL에서 초기 public shell/header/footer/main/skip 목적지가 하나인지, noindex와 404 boundary 신호/안내 payload가 있는지 확인한다. 인증 관리자의 없는 match와 player 주소는 404 boundary/noindex, public shell 중복 없음, 업무별 복구 payload를 확인하고 익명 관리자 주소는 로그인으로 이동해야 한다. async 관리자 layout은 HTML shell 자체도 Flight로 전달될 수 있어 실제 최종 landmark를 이 HTTP 검사만으로 주장하지 않는다.

최초 실행은 공개 틀/헤더/푸터/main 개수가 1로 바뀐 것을 확인했지만 제목 정적 markup 개수가 0이라 실패했다. 원본 [첫 실행 기록](not-found-streaming-observation.log)을 보존한다. 일반 요청은 loading shell과 Flight의 not-found 전환을 스트리밍할 수 있으므로 이 결과만으로 수정 성공이나 실제 404 본문 소실을 단정하지 않았다.

구현 담당자가 HTML 제한 crawler UA(Twitterbot)로 완성된 서버 렌더 HTML을 얻으려 한 두 번째 실행도 HTTP 200으로 관측되어 404 status 단정에서 실패했다. 이 시도는 UA만으로 완성된 본문을 보장했다는 근거로 쓰지 않는다. 최종 검증은 응답의 실제 streaming 404 신호/초기 틀과 일반 브라우저의 hydration 이후 404 내용/landmark를 구분해야 한다. HTTP 기대를 없애는 것만으로 실제 화면을 통과시킬 수 없다. [Next 공식 not-found 규약](https://nextjs.org/docs/app/api-reference/file-conventions/not-found#not-foundjs)의 streaming 200과 비스트리밍 404 구분에 맞춘 검증 계층 분리다.

- 독립 소스 검토: 완료, 404 변경 범위에 추가 actionable finding 없음.
- 새 경계 HTTP 회귀: [최종 격리 HTTP](not-found-http-after.log) PASS 및 임시 DB cleanup 완료. 404 경계뿐 아니라 1.0.2 owner 수정/업로드/취소/동시성/승인 흐름도 유지됐다. 초기 streaming 관측 실패는 [별도 기록](not-found-streaming-observation.log)으로 보존한다.
- 독립 실행 렌더: `node --test tests/not-found-layout.test.mjs` [3/3 PASS, exit 0](independent-render.log). 실제 async layout·SiteShell/AdminShell·404 content를 실행하고 탐색 client widget과 인증 조회만 격리한 상태에서 최종 main/제목/복구 링크를 확인했다. 관리자 인증 함수 호출도 확인한다. 실제 Next router 선택·브라우저 hydration을 대체하는 검사는 아니다.
- 필수 lint/type/build 및 일반 브라우저 DOM: 통합 담당자 실행 결과 대기. 독립 검토자가 실행했다고 주장하지 않음.
- 1.0.3 배포/운영: 대기. 1.0.2에서 발견한 P2의 완료 근거로 이 문서만 사용하지 않음.

## 범위와 미확인 조건

이번 review의 source 범위는 404 구성 파일 4개, 실제 HTTP harness 1개, 실행 렌더 회귀 1개다. 같은 worktree의 1.0.2 배포 문서, MMR 전환 검토/백업, STATUS/registry는 다른 지정 담당자의 병렬 작업이며 이 검토자가 수정하지 않았다. 패키지·migration·자산·사용자의 다른 checkout을 수정하지 않았다.

[1.0.2 배포 후 발견 기록](../service-completion-v1.0.2-2026-10-06/post-deploy-independent.md), [실제 외부 연동](../service-followup-2026-10-06/external-runtime.md), [MMR 별도 운영 검토](../service-followup-2026-10-06/mmr-transition-review.md)는 별도 근거로 유지한다. 404 구조 수정이 MMR 운영 전환, 외부 기기·자격, 실제 스크린리더 조합을 완료했다는 의미는 아니다. 확인한 원인에는 이 경계/공통 내용 분리로 충분하며 전체 라우터·디자인·인증 구조를 바꾸거나 새 기능을 추가할 근거는 발견하지 못했다.
