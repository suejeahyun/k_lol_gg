# 1.0.3 운영 반영 후 소스·근거 재검토

2026-10-06 KST. 고정 source와 모든 변경 기능의 검증 연결을 읽고, 운영 provider metadata·공개 GET을 별도로 확인했다. 이번 검토에서는 제품 source·패키지·운영 데이터·권한을 변경하지 않았다. 검토자는 앞 단계의 랭킹 선택 UI 구현 담당자였으므로 그 변경을 자기 소스 검토만으로 독립 통과시킨 것으로 세지 않는다. 랭킹을 포함한 다른 담당자의 [독립 교차 검토](independent-final-review.md)와 실제 운영 관측을 함께 사용한다.

## 결론과 범위

현재 고정 source와 아래 운영 표본에서 **추가 중대 결함·주요 과업 방해 또는 1.0.3 릴리스 차단 사유를 발견하지 못했다.** 알려진 1.0.2의 중복 404 화면은 최종 운영 브라우저에서 header/footer/main 하나로 확인됐다. 이 판단은 미완료 MMR 전환·외부 자격·실기기까지 서비스 전체가 완료됐다는 선언이 아니다.

이번 source의 404 경계, 제출 입력/복구 구성, 랭킹 직접 선택, 신청 종류의 메뉴 상태, 팀 검색 loading, 한글 포지션 표시, Next.js 및 하위 보안 패치가 각각 구현·회귀·검토 근거에 연결돼 있다. 해당 source는 새 page/API·DB migration·회원 권한·집계 수식을 추가하지 않는다. 코드만 변경되고 검증 근거가 없는 기능군은 이 diff에서 확인하지 못했다.

## 배포 대조와 직접 실행

[정제된 독립 운영 기록](post-deploy-independent.json)에 원본 시각·응답·초기 검사 가정과 최종 판단을 함께 보존했다.

| 항목 | 실제 확인 |
| --- | --- |
| source | `824502a20065c4d2d84d3676e9db47028ca6c913` |
| 승격 후보 | `dpl_DVr4h9NXK5RMaMGZEaPgMARBfgWr`, READY, `https://k-lol-rko8onjcf-tjdmswo11-3715s-projects.vercel.app` |
| 최종 main 배포 | `dpl_B9ZsVWWauhziZf4veFaKo68TpB1B`, READY, `https://k-lol-fblz7crdr-tjdmswo11-3715s-projects.vercel.app` |
| 운영 주소 | `https://k-lol-gg.vercel.app`의 inspect ID가 최종 main과 일치 |
| 최종 운영 health | `2026-10-06T00:29:36.726Z` / 09:29 KST, HTTP 200, `ready`, `no-store` |

기존 인증으로 Vercel deployment read API의 source metadata를 직접 확인했다. 후보·main 모두 위 source와 일치한다. raw metadata의 불필요한 환경·작성자 정보는 문서에 포함하지 않았다. source가 없는 inspect 응답만으로 커밋을 추정하지 않았다.

승격 후보를 가리키던 canonical alias에 `2026-10-06T00:27:14.558Z`부터 다섯 가지 익명 GET 표본을 수행했다. 실제 회원 정보·신청·경기·이미지를 쓰지 않았다. main이 같은 source로 READY된 뒤 alias를 다시 대조하고 health를 한 번 더 읽었다. 전체 31개 suite는 중복 실행하지 않았다.

- `/api/health`: ready와 no-store.
- `/`: 승률·최다 참여·최다 MVP의 실제 button 이름, 선택 하나(`aria-pressed`), 동일 슬라이드 대상, 슬라이드 하나, 이전/다음·수동 재생, 중복 다음 안내 제거.
- `/matches/submit?code=invalid`: HTTP 200 streaming 응답의 404 digest와 noindex, 복구 안내 payload, 초기 public shell/header/footer/main 각각 하나. HTTP 정적 문자열은 최종 hydration된 DOM을 대신하지 않는다.
- `/qa-independent-missing-20261006`: HTTP 404, 정적 HTML의 실제 404 제목과 홈 복구, public shell/header/footer/main 각각 하나.
- `/admin/matches/00000000-0000-4000-8000-000000000001`: 익명 요청은 같은 운영 origin의 `/admin/login`으로 307. 보호된 관리자 내용을 읽거나 관리자 계정을 시험하지 않았다.

초기 probe는 모든 404에서 robots meta를 요구해 unmatched root에서 한 항목이 실패했다. 실제 응답은 200 성공 화면이 아니라 **HTTP 404와 완성된 복구 화면**이었고 robots meta만 없었다. [Google 공식 HTTP 처리](https://developers.google.com/crawling/docs/troubleshooting/http-status-codes)는 404를 포함한 4xx 내용을 검색 색인에 사용하지 않는다고 명시한다. 저장소에서 별도의 ‘모든 404 meta 필수’ 계약도 발견하지 못했다. 따라서 이 초기 도구 가정은 제품 blocker로 만들지 않았으며 응답·실패를 숨기지 않고 JSON의 `initialProbe`와 판단 이유에 보존했다. 반면 HTTP 200 streaming 경로의 noindex/404 경계는 실제로 확인했다.

## 최종 source의 검증 연결

- [필수 검사](check.log): 계약 476 PASS, 단위 1,047 PASS와 조건부 skip 1, lint 오류 0/기존 경고 58, 타입·ERD·이미지와 **Next.js 16.3.8 production build** 완료. 통합 담당자가 exit 0을 확인했다.
- [최신 격리 PostgreSQL 기록](database-final.log): 인증/권한·신청·팀·경기·집계·미디어·Riot·운영 계약, 전체 논리 복원과 migration 재실행을 확인했다. 같은 최종 check 빌드의 fixture를 이용했으며 통합 담당자의 종료/cleanup 성공과 마지막 cluster 정리 기록을 확인했다. 과거 framework 결과를 새 실행으로 재표기하지 않았다.
- [소유자 HTTP와 404 경계](not-found-http-after.log), [404 실행 렌더](independent-render.log), [제출 교차 검토](submission-cross-review.md), [메뉴/검색/포지션](navigation-search-positions.md), [랭킹 개선](home-ranking-discoverability.md)에 상태·권한·복구별 근거가 있다. 이 로그들의 개별 실행 시점은 유지하며 최종 framework 빌드와 운영 확인은 위 근거로 구분한다.
- [의존성 검토](security-dependencies.md): runtime audit 0, 전체 audit의 개발 도구 경고는 잔존 원인과 실제 호출/산출물 trace로 구분한다. 전체 audit 0이나 모든 취약성이 제거됐다고 주장하지 않는다. 강제 major override나 API/DB 정책 변경 없이 패치했다.
- [운영 서비스 HTTP](production-service-http.json)와 [기본 경로/자산](production-http-base.json)은 통합 담당자가 실행한 31개 조건, 14개 경로와 11개 자산의 별도 증거다. 이번 독립 검토자가 다시 실행한 것처럼 세지 않는다.

## 실제 브라우저 증거와 한계

브라우저 조작은 통합 담당자가 수행했으며 이 검토자는 저장된 결과를 읽었다.

- [운영 홈 화면](browser-home-layouts.json): 320/390/768/1280px에서 문서 가로 넘침 없음, 세 선택 버튼 높이 모두 44px, 홈 여섯 영역 순서 유지. MVP 클릭, 왼쪽 방향키로 참여 이동, Enter로 승률 선택 후 자동 넘김 정지 확인.
- [운영 404 최종 DOM](browser-production-boundary.json): 잘못된 접수 코드의 최종 header/footer/main 각각 1, 가로 넘침 없음. 통합 담당자는 홈 복구 링크 이동도 확인했다.
- [격리 브라우저 경계](browser-boundaries.json): 공개 잘못된 코드·없는 선수/경기·unmatched URL 네 가지, 인증 관리자 없는 경기에서 390px의 정상 복구 구성 확인. 관리자는 main 1/public shell 0이다.
- 제출 화면의 최종 모바일 캡처도 검토했다. 전체 페이지 캡처 안의 sticky/fixed 요소 위치를 실제 스크롤 뷰포트의 겹침 결함으로 단정하지 않았다. 스크린샷을 입력 저장·세션 검사의 증거로 확대하지 않는다.

이 기록은 브라우저를 에뮬레이션한 폭에서의 실제 DOM/조작과 HTTP 결과다. 실물 휴대폰, 모든 스크린리더, 외부 메시지 송수신, 신규 이용자 성공률 및 장시간/최대 부하를 측정한 기록이 아니다. 관측하지 않은 런타임 로그 전체나 모든 사용자 요청의 무오류를 보장하지 않는다.

## 남은 별도 운영 조건

[외부 연동 실행](../service-followup-2026-10-06/external-runtime.md)과 [MMR 전환·백업 검토](../service-followup-2026-10-06/mmr-transition-review.md)를 그대로 유지한다. MMR 구 공식 전환에는 실제 최고관리자 로그인과 지정 운영 절차가 남고, 13개 미소비 변경 이벤트를 13개 경기 또는 이번 UI 배포로 반영 완료라고 쓰지 않는다. RSO 자격/동의, 카카오 실기기 수신, 개별 Riot PARTIAL 원인, provider PITR·Blob/키 전체 복구 같은 조건도 이 소스 릴리스 완료와 분리한다.

위 증거 범위에서는 같은 검사 반복이나 새 기능군을 추가할 근거가 없었다. 실제로 확인한 복구/발견성 원인을 해결하고 검증한 소스가 운영 alias와 일치하므로, 이번 1.0.3 변경에 대한 추가 source 수정은 필요하다고 판단하지 않았다.
