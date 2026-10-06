# 1.0.5 운영 배포 후 독립 표본 확인

2026-10-06 11:11~11:12 KST. 배포 담당자와 별도로 Vercel 읽기 전용 deployment API와 canonical alias inspect를 호출하고, 변경 범위의 익명 HTTP 표본을 확인했다. 제품 소스·배포·세션·회원·신청·경기·권한을 변경하지 않았으며 공유 CUA 탭을 조작하지 않았다. 정제 결과는 [post-deploy-independent.json](post-deploy-independent.json)에 있다.

## 결과

지정한 표본은 통과했고 새 중대 오류나 변경 범위의 추가 차단 결함을 발견하지 못했다. 운영 주소는 [k-lol-gg.vercel.app](https://k-lol-gg.vercel.app)이다.

| 대상 | 실제 확인 |
|---|---|
| 배포 소스·별칭 | GitHub main source `c9431b9e68b468c17d02c6ff7595de7e14a7c9c8`, `dpl_HuMGR69n3o964U2CnZZicYHCKhW7`, production READY. 별도 canonical inspect도 같은 ID/READY. [개별 배포](https://k-lol-hhf457dov-tjdmswo11-3715s-projects.vercel.app) |
| `/api/health` | HTTP 200, ready, no-store. 전체 외부 공급자나 예약 작업 성공을 뜻하지 않음 |
| 팀 초안 로그인 복귀 | 새로 만든 검사 전용 UUID의 초안 주소에 `tab=recommendations&team=RED`를 붙여 익명 조회. 실제 스트리밍 응답의 meta refresh와 NEXT_REDIRECT가 `/login`을 가리키며, decoded next는 UUID·두 query를 포함한 원래 주소와 정확히 일치. 실제 사용자 초안을 조회하거나 로그인하지 않음 |
| 운영 랭킹 CSS | `/rankings?minParticipation=0` HTTP 200, 서버 오류 문구 없음. 페이지가 실제 연결한 CSS 두 파일 모두 200. 랭킹 CSS `2zjzurgxhtxhy.css`의 board 선수 링크와 podium 링크 모두 `min-width:0; overflow-wrap:anywhere` 포함. 각 파일의 SHA-256을 JSON에 기록 |
| 관리자 이벤트 API | 쿠키 없이 `/api/admin/competitions/events` GET은 HTTP 401, UNAUTHENTICATED, no-store. 엔티티 목록/data 없음 |
| 관리자 문의 API | 쿠키 없이 `/api/admin/operation-forms?type=suggestions` GET은 HTTP 401, UNAUTHENTICATED, no-store. 문의 목록/data 없음 |

선택한 page/API 경로는 다섯 개이며 랭킹 페이지에 연결된 CSS 두 개를 추가로 읽었다. root의 31개 운영 HTTP나 홈 네 viewport 검사를 재실행하지 않았다. 원문 HTML/문의/선수 응답과 provider의 사용자·환경 metadata는 공개 증거에 저장하지 않았으며 상태·통과 여부·필요한 배포 식별자·CSS 해시만 남겼다.

## 검사 실행기 정정

첫 문의 표본에서 목록 경로를 존재하지 않는 `/api/admin/operation-forms/suggestions`로 잘못 지정해 JSON 파싱이 실패했다. 실제 route 파일을 읽고 목록 계약인 `/api/admin/operation-forms?type=suggestions`로 정정했다. 제품 결함이나 제품 수정으로 세지 않는다.

초안 표본의 첫 assertion은 HTTP 307만 기대했다. 설치된 Next 16.3.8의 `docs/01-app/03-api-reference/04-functions/redirect.md`는 스트리밍 상황의 meta 이동을 명시한다. 해당 경로만 다시 확인해 **실제 meta refresh, NEXT_REDIRECT, 같은 origin의 로그인 주소, 정확한 next 전체 문자열**을 모두 검증했다. 단순히 HTTP 200을 허용하도록 기대값을 약화하지 않았다. 이 한정 재확인을 검사 수에 더해 성과를 부풀리지 않는다.

## 완료 범위와 남은 경계

이 표본은 운영 서버가 배포한 코드·복귀 지시·CSS·인증 차단을 확인한다. 로그인 후 실제 복귀 조작이나 hydration 이후 키보드·포커스·레이아웃 검사를 대신하지 않는다. 긴 이름의 실제 줄바꿈/성적 분리는 root가 별도 새 합성 fixture의 320·390·768·1280px에서 확인한 [브라우저 기록](browser.md)과 [측정](ranking-layout-after.json)을 따른다. 이 담당자는 이벤트 adapter 구현에도 참여했으므로 이번 독립 운영 표본을 자기 코드의 별도 독립 승인으로 중복 계산하지 않는다.

native `window.confirm` 뒤 공유 브라우저 도구의 입력/상태/닫기가 응답하지 않는 문제와 사용자에게 확인창/검증 탭 닫기를 요청한 상태는 아직 해소되지 않았다. 신청 취소와 문의 관리자 저장의 **실제 UI 종료 상태는 미확인**이다. 이를 외부 계정 권한 부족, 실기기 미보유, 제품의 영구 결함 또는 저장 성공으로 바꾸어 쓰지 않는다. 완료된 handler·격리 DB·HTTP 결과도 그 UI 완료를 대신하지 않는다.

이번 운영 표본에서는 인증 쓰기, 실제 신청/대회/징계/문의 변경, 실제 외부 메시지 수신·OCR 정확도·Riot RSO·MMR 운영 재계산·장시간 부하·외부 경보·PITR/전체 자산 복원을 실행하지 않았다. [18기능군 검증 경계](coverage-gaps.md), [기존 외부 실측](../service-followup-2026-10-06/external-runtime.md), [MMR 전환 조건](../service-followup-2026-10-06/mmr-transition-review.md)을 별도로 유지한다. 이번 표본에서 추가 소스 수정이나 동일 HTTP 검사 반복을 정당화하는 새 결함은 발견하지 못했다.
