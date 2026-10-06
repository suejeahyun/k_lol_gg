# 1.0.2 배포 후 별도 재검토

2026-10-06 KST. 접수 API·신청 문구를 구현하지 않은 검토자가 운영 alias, provider metadata, 공개 GET과 제한된 runtime 로그를 확인했다. 앱 소스·운영 계정·회원 신청·경기·이미지·설정을 변경하지 않았다. 통합 담당자의 31개 HTTP smoke를 반복하지 않고 변경 흐름의 진입·복구·인증 경계를 표본 검사했다.

## 판정

1.0.2는 검증한 source로 운영에 반영되었고 접수/신청 진입과 익명 권한 경계에서 새 5xx를 관측하지 않았다. 그러나 잘못된 접수 코드 주소의 최종 브라우저 화면에서 **P2: 404 화면의 공통 틀이 중복되는 문제**가 추가 확인되었다. 따라서 배포 후 검토를 ‘새 발견 없음’이나 서비스 완료로 표시하지 않는다. 1.0.2에서는 미해결이며 별도 1.0.3 수정·검사·운영 확인이 필요하다.

## 운영 source 대조

[독립 배포 metadata](post-deploy-independent-deployment.json):

- source: `0410c1b56c2f62c5da0cc992d081c8d4cfb56991`
- 승격 후보: `dpl_GmPDVhfYGUWak4LGCsmnUSiMhtue`, READY, `https://k-lol-lotp3u34x-tjdmswo11-3715s-projects.vercel.app`
- 같은 source의 최종 main 배포: `dpl_8mrTSkSRqj3kmxwJN41sNUSUnR6K`, READY, `https://k-lol-pkbh3zamm-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- 최종 대조 시각: `2026-10-06T00:02:27.683Z` / 09:02 KST

기존 인증의 Vercel read API로 후보와 최종 배포의 `gitCommitSha`/`githubCommitSha`를 대조했고 alias inspect의 실제 deployment ID가 최종 main 배포와 같았다. `inspect --format json`에 source metadata가 없다는 이유로 임의 추정하지 않았다. provider 원본의 작성자·환경 등 불필요한 필드는 증거에서 제외했다.

## 실제 GET 및 복구 경계

[독립 HTTP/HTML 관측](post-deploy-independent-http.json)은 `2026-10-06T00:00:54.345Z`에 승격 후보를 가리키는 canonical alias에 익명 GET만 보냈다. 이후 최종 main alias에서 잘못된 코드의 streaming 신호도 다시 관측했다.

| 대상 | 실제 관측 | 판정 |
| --- | --- | --- |
| `/applications` | 200, ‘오늘 같이 뛰어요’, 오늘 내전·이벤트전·멸망전·파티 모집, 신청으로 복귀하는 로그인 링크 | 첫 진입의 목적·종류 선택·다음 행동 노출 확인 |
| `/applications?type=season&recruitNo=0` | 200, 주소 확인 안내, `role=alert`, 신청 화면 다시 열기 링크 | 잘못된 회차의 복구 경로 확인 |
| `/matches/submit?code=MR20000000000000000` | 200, 제출 목적/비공개 설명, 동일 코드가 들어 있는 login `next` | 익명 사용자의 제출 문맥 보존 확인. 실제 회원 접수를 읽거나 생성하지 않음 |
| `/api/me/match-submissions/MR20000000000000000` | 401 `UNAUTHENTICATED`, `application/problem+json`, `no-store`, 접수 객체 없음 | 익명 소유자 API 접근 차단 확인 |
| `/matches/submit?code=invalid` | streaming HTTP 200, `NEXT_HTTP_ERROR_FALLBACK;404`, `noindex`; 통합 담당자의 CUA에서 실제 404 안내 표시와 공통 틀 중복 | 초기 probe의 HTTP 404 단정은 부적절. 별도의 실제 화면 결함은 아래 P2로 남김 |

최초 HTTP 도구는 마지막 주소에 404 status와 정적 HTML의 404 제목을 기대해서 실패했다. 소스에서 잘못된 query가 `notFound()`로 가는 것을 확인했고 실제 응답에 404 전환 신호·noindex가 있었다. Next의 [공식 not-found 문서](https://nextjs.org/docs/app/api-reference/file-conventions/not-found#not-foundjs)도 streamed response의 HTTP 200을 명시한다. 초기 관측을 지우거나 이를 저장 API의 500 회귀로 해석하지 않았다. 최종 화면은 HTTP 문자열 검사로 통과시키지 않고 통합 담당자에게 CUA 확인을 요청했고, 그 확인에서 중복 틀이 발견되었다.

## 추가 발견 P2 — 공개 404의 중복 틀

- 재현: 운영 `/matches/submit?code=invalid`에서 최종 ‘찾으시는 페이지가 없어요’ 안내와 함께 header/footer/main 영역이 중복된다. 실제 CUA 조작·DOM 관측은 통합 담당자가 수행했으며 독립 검토자가 직접 브라우저를 조작했다고 주장하지 않는다.
- 소스 근거: `src/app/(public)/layout.tsx`는 자식을 `SiteShell`로 감싼다. `src/app/not-found.tsx` 역시 전체 내용을 `SiteShell`로 감싼다. 공개 segment의 not-found 처리에서는 두 틀이 중첩될 수 있다.
- 영향: 잘못된 주소에서 복구 메뉴가 중복되고 문서 landmark/키보드 탐색 구조가 흐트러진다. API 소유권·데이터 저장 실패나 5xx 문제와는 구분한다.
- 상태: 1.0.2 미해결. 통합 담당자가 별도 담당자에게 경계 수정과 회귀 검사를 배정했다. 수정 후 중첩 공개 경로와 root 미일치 경로를 모두 확인해야 root 404의 공통 틀까지 제거하는 회귀를 피할 수 있다.

## 제한된 runtime 로그

[정제된 runtime 표본](post-deploy-independent-runtime.json)은 승격 후보에 `--since 15m --limit 300`으로 조회한 300개 항목이다. 한도에 도달했으므로 해당 기간 전체 로그라는 주장을 하지 않는다. 표본의 error/fatal과 5xx는 0개였고 변경 흐름의 신청·제출·익명 소유자 GET과 일치하는 48개 항목에서도 error/fatal은 없었다. status 0인 전체 7개/관련 1개는 미완료 기록으로 분리하며 성공으로 세지 않는다. 해당 로그는 브라우저 콘솔·모든 회원 mutation·후속 main 배포 전 기간의 무오류 증명이 아니다.

## 남은 범위와 연결

이번 읽기 전용 검사는 실제 회원의 수정·업로드·취소를 운영에서 재실행하지 않는다. 해당 기능의 실제 인증 HTTP·임시 DB·합성 이미지 검증은 [소스 독립 검토](independent-review.md)와 [소유자 과업 증거](../2026-10-06-owner-task-http/README.md)를 따른다. 운영 root 담당자의 공개 화면·배포 확인과 이 제한된 검토를 구분한다.

운영 MMR 공식 전환과 미소비 변경 이벤트 13건, 실제 외부 자격/기기 등이 필요한 조건은 [외부 실행 증거](../service-followup-2026-10-06/external-runtime.md)에 남아 있다. 이번 릴리스 source 일치나 저장 API 수정이 이를 완료한 것은 아니다. 확인한 범위에서 위 404 틀 결함 외에 새로운 코드 수정이 필요한 문제는 발견하지 못했으며, 동일 smoke를 늘리기보다 이 실제 발견을 수정·재검증하는 것이 다음 단계다.
