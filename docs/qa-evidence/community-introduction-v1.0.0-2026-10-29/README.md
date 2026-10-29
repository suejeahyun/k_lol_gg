# 커뮤니티 소개 1.0.0 검증·운영 반영

소스 `e262e231466ee814d2b10d29c1afdca946487bf2`, tag `community-introduction-v1.0.0`, migration `0052_community-introduction`. 사용자 요청에 따라 각 사이트 ADMIN/SUPER_ADMIN이 자기 DB에 소개를 저장하고 GG HUB에서 공개 소개를 읽도록 연결했다.

## 기능

- GG HUB 카드의 소개 보기 → 사이트별 상세 소개. 기존 방문 버튼 유지.
- 각 사이트 /admin/community-introduction에서 한 줄 소개·본문·활동·시간·가입 안내·문의 링크·배너·공개 여부 관리. 빈 비공개 기본값, 저장 전 미리보기, 충돌/재시도 보호.
- 기존 브랜드·테마·회원·모집·경기 자료와 분리. 공개 DTO만 가져오며 쿠키·DB 자격증명·내부 운영 기록을 전달하지 않는다.
- 등록된 공개 사이트의 정확한 HTTPS origin만 조회하고 DNS/IP 고정·TLS·리다이렉트 차단·시간/크기 제한을 적용한다. 원본 비공개 또는 장애 시 기본 소개를 표시한다.

## 검증

전체 check EXIT0: 계약802, 단위1322+기존SKIP1, 타입·ERD·이미지68·production build99. lint 오류0/기존경고89. PostgreSQL 계약18와 실제 Next HTTP16 통과. 현재 트리 비밀정보 검사 통과, 전체 Git 이력 검사는 이번 릴리스에서 실행하지 않았다. [전체 검사 요약](checks.json), [DB 계약](database-contracts.json), [실제 HTTP](local-http.json).

관리자 화면은 합성 자료로 데스크톱·모바일을 확인했다. IAB 입력 도구의 stale-node 오류로 저장 버튼 클릭 검증은 완료하지 못했으며, 실제 저장·공개·비공개 동작은 HTTP 검증16건에 포함된다. 운영 HUB에서 소개 버튼 클릭 후 NEXUS 상세 화면 이동을 직접 확인했다. 요청390px/문서375px에서 scrollWidth도375px로 가로 넘침이 없었다. 임시 viewport·QA서버·합성DB는 정리하고 기존 로컬 HUB56916은 보존했다.

Next 스트리밍 페이지는 미등록 UUID에서 HTTP200과 notFound/noindex를 함께 반환할 수 있다. 실제 소개가 나타나지 않는 notFound 경계와 noindex를 검사했다. API 권한/비공개 응답은 별도 HTTP 상태로 검사했다.

## 배포

| 서비스 | 배포 ID | 주소 | 후보/운영 HTTP |
|---|---|---|---|
| hub | `dpl_63MvHbqjy4fM8mwUNQHdNJMmKJ6w` | [운영](https://gg-community-hub.vercel.app) | 13/13 |
| nexus | `dpl_3zmfMmG3xbdjcAd38dDQGkHESzAM` | [운영](https://nexus-gg-kr.vercel.app) | 5/11 |
| klol | `dpl_HtzjhJqxoXt2J9NTyZtVAzcqd2QB` | [운영](https://k-lol-gg.vercel.app) | 11/11 |

각 READY·동일 source·실제 alias 대상·health ready를 확인했다. HUB 기존 가입/개설/관리/인증/worker 경계28조건도 통과했다. 원래 enabled 상태의 Cron을 유지했고 빈 큐에 대한 인증된 worker 응답은 idle이다. 새로운 사이트 엔진도 같은 source로 갱신했다. 실제 신규 사이트를 추가로 생성해 시험하지는 않았다. [배포·DB 근거](production.json), [HUB 기존 경로](hub-regression.json), [엔진 연결](engine-pin.json).

## DB 보존과 복구

세 DB 각각 읽기 전용 일관 snapshot으로 백업하고 별도 loopback DB에 실제 복원하여 기존 행 수·구조·설정·journal을 비교했다. 로컬 upgrade와 재실행 후 운영에 전진 적용했다. K-LOL50→53, NEXUS51→53, HUB52→53이며 새 소개 테이블과 필요한 이전 메타데이터 테이블은 빈 상태다. 기존 설정/구조/행을 이번 스크립트로 수정하지 않았다.

시간대 표시 차이는 UTC로, PG18.6/18.3의 두 partial-index 표현만 확인된 형태로 정규화했다. PG17 K-LOL의 PG18 복원은 중복 NOT NULL catalog 항목을 제외하되 column nullability를 유지하고 enum label 순서로 비교했다. 첫45개 K-LOL migration은 2026-09-25에 게시된 정확한 journal fingerprint와 일치함을 확인해 그대로 보존했다. 역사 migration을 다시 실행하거나 재작성하지 않았다.

검증된 archive와 체크포인트는 로컬 .private/recovery/community-introduction-20261029/<서비스>/에 보관하며 공개 문서에는 값이나 원본 데이터를 넣지 않는다. 앱 복구는 production.json의 이전 deployment를 해당 프로젝트에 재승격하고 추가 테이블은 유지한다. DB 복구가 필요하면 쓰기를 중지하고 검증된 archive/PITR 복원 계획을 별도로 수행한다. 즉석 down migration은 사용하지 않는다.

운영 소개 내용은 임의로 작성하거나 공개하지 않았다. [운영 방법](../../operations/community-introduction.md)을 따라 각 사이트 운영진이 작성하고 공개한다. 제휴·회원 정보 공유·공동 대회·동적 폰 설정의 구현 완료를 뜻하지 않는다. 새 구독/요금제 변경과 휴대폰 설치는 없다.
