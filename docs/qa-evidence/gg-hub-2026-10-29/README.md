# GG HUB 독립 중앙 사이트 검증

사용자가 원한 구조는 NEXUS 내부 메뉴가 아니라 K-LOL/NEXUS 및 신규 사이트를 관리하는 별도 중앙 사이트다. 이번 변경은 별도 브랜드·DB·인증·허용 경로·홈·관리 화면을 갖춘 `hub` 배포를 만든다.

## 확인 범위

- `npm run check`: 통과. lint 오류 0/기존 경고 89, 타입, ERD 118개 테이블·178개 FK, 계약 786 PASS, 단위 1227 PASS/기존 SKIP 1, 이미지 검증, 기존 NEXUS 빌드.
- 자식 사이트 환경을 제거한 `NEXT_PUBLIC_SERVICE_ID=hub` 전용 production 빌드 통과.
- 부트스트랩 단위 3건, 격리 PostgreSQL 6건: fresh 51개 migration, 임시 비밀번호 강제 변경, replay 보존, 연결 대상 불일치, 기존 계정 보호, migration만 완료된 중단 복구, 다른 브랜드 거부.
- 로컬 HTTP 30건 통과: [http.json](http.json). 최초 비밀번호 변경, 이전 세션 폐기, 관리자 로그인, 중앙 권한, 사이트 추가·13번째 방 저장, 멱등 재시도, stale revision, 교차 출처 요청 차단, 기존 게임/카카오 API 차단, 로그아웃.
- 현재 트리 비밀정보 검사 통과. 운영 URL/DB 비밀번호/임시 비밀번호/쿠키는 근거 파일에 포함하지 않는다.

## 브라우저

실제 hub 빌드의 별도 합성 DB에서 확인했다. 공개 K-LOL/NEXUS 소개를 사용하되 기존 사용자 데이터는 가져오지 않았다. 공개 홈 2개 사이트, 관리자 2개 사이트·4개 방, 사이트 선택에 따른 방 분리를 확인했다. 390px 화면에서 홈과 관리자 모두 문서 폭 375px로 가로 넘침 없음, main landmark 각 1개. 테스트 중 viewport는 복원했다.

- [홈](home-local.jpg), [모바일 홈](home-mobile.jpg)
- [관리자](admin-local.jpg), [모바일 관리자](admin-mobile.jpg)

## 새 운영 DB

[database.json](database.json): 독립 Neon `GG-HUB` 프로젝트, PostgreSQL 18, `gg_hub`, 51개 migration. 빈 DB에서 최초 관리자 1명·공개 사이트 2개·방 4개·초기화 감사 기록만 구성했다. 비밀번호 hash 검증과 replay 무변경을 확인했다. 나머지 110개 앱 테이블은 비어 있으며 기존 두 DB에 접속해 자료를 복사하지 않았다.

## 구현 경계

사이트·방 등록은 실제 API/회원/폰 연결과 다르다. 연결 `UNVERIFIED`, 폰 설정 `NOT_APPLIED`를 유지한다. 운영 계정 첫 로그인은 별도로 전달된 비공개 임시 비밀번호 변경이 필요하다. 연합·공동 대회·운영 기록·동적 폰 배포는 후속 단계다.

## 배포

소스 `2bea3cbad7933bc508e871d34ec03aaa624c4315`, tag `community-hub-v0.1.0`.

| 서비스 | Vercel deployment | 운영 결과 |
|---|---|---|
| GG HUB | `dpl_2LUeq1vEbtqBZHFDkNcdE9inmLnZ` | [gg-community-hub.vercel.app](https://gg-community-hub.vercel.app), READY, health ready |
| NEXUS | `dpl_4x3vz5msZg8Sumv7Cd1vQpy8XpRa` | [nexus-gg-kr.vercel.app](https://nexus-gg-kr.vercel.app), READY, health ready |

허브 [후보 24건](candidate.json) 및 [운영 24건](production.json) 통과. 별도 계정 로그인과 임시 비밀번호의 관리자 접근 거부, 공개 사이트 목록, 권한/자식 API 차단을 확인했다. 확인용 세션은 로그아웃했으며 최초 비밀번호 변경은 사용자가 진행한다. [실제 운영 화면](home-production.jpg)도 확인했다.

NEXUS는 기존 등록 자료가 비어 있음을 읽기 확인한 뒤 `COMMUNITY_NETWORK_ENABLED=false`만 변경했다. 다른 환경변수는 보존했다. [후보](nexus-candidate.json)와 [운영](nexus-production.json) 각 10건 통과. 비활성 공개 경로는 Next streamed notFound 특성상 HTTP 200이지만 404 안내와 noindex를 출력하며 등록 목록이 없다. 등록 API는 명시적인 `COMMUNITY_NETWORK_UNAVAILABLE` 503으로 비활성화된다. 기존 마스코트 홈·모집·플레이어·MMR·Riot 소유 인증은 유지한다. [카카오 서명 진단 4건](kakao-server.json) 통과, 실제 방 메시지 발송과 폰 변경은 없었다.

새 후보 검증에만 사용한 Vercel automation bypass 키는 매번 철회했다. 운영 보호 설정은 유지했다. K-LOL 프로젝트는 변경하지 않았으며 health ready를 읽기 확인했다. NEXUS 복구 대상은 이전 `dpl_nnAwySycvaNVhApHqEdqzXufvn19`이고 필요 시 기능 플래그만 이전 true로 복구할 수 있다. DB/테이블 삭제는 필요 없다.
