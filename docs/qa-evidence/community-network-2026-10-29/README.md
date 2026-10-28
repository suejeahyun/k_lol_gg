# 커뮤니티 등록 기반·대회 MMR 점검 QA

확인일: 2026-10-29 · 작업 브랜치: `codex/nexus-gg-20261027`

## 범위와 상태

기능: `community-network-registry@0.1.0`, `competition-mmr-integrity@1.0.0`.

사이트/방 메타데이터 관리와 공개 목록, 재현된 대회·순위 오류 3건, 표본 표시를 다룬다. [실행 계획](../../architecture/community-federation-execution-plan.md)과 [산식 감사 보고서](../../architecture/drafts/balance-mmr-audit-2026-10-29.md)를 함께 본다.

운영 배포 상태는 **NOT_DEPLOYED**다. 운영 DB migration, 점수 재계산, 기존 계정 병합, 중앙 프로젝트 생성, 폰 설치·설정 교체를 하지 않았다. 실제 사이트 연결·내 소속·연합·공동 대회·운영 기록 공유는 아직 구현하지 않았다.

## DB·권한 검증

PostgreSQL 18의 임시 loopback 클러스터와 합성 데이터만 사용했다.

```powershell
$env:PG_BIN_DIR='C:\Program Files\PostgreSQL\18\bin'
$env:V2_DB_CONTRACT_SCOPE='community-network'
npm.cmd run test:db
$env:V2_DB_CONTRACT_SCOPE='mmr'
npm.cmd run test:db
```

두 DB harness는 같은 폐기 클러스터 정리 경로를 사용하므로 순차 실행한다. 최초 병렬 시작에서 한 harness가 안전 가드로 중단됐으며, 순차 재실행으로 검증을 완료했다. 운영 대상 연결 시도는 없었다.

- 새 설치·재적용: 1 PASS.
- 기존 데이터 보존 업그레이드·기본 DB 계약: 8 PASS.
- 커뮤니티 DB: 상위 테스트 포함 11 PASS. 12개 동적 방, 공개 허용 필드, 초안/보관 제외, 감사 정보 제한, 중복 URL/slug, 방 이동/삭제 금지, 보관 시 비활성, 동시 버전 충돌, 멱등성, 일반 관리자 거부, 만료/철회/강등 세션 차단, 마지막 감사 저장 실패 시 전체 rollback 검증.
- MMR DB: 5 PASS. 기존 전체 원장 재생·정정/무효·삭제/410경기·명령 영수증과 포지션 누락 정렬/페이지 경계 검증.
- 생성 migration `0050_community-network-registry`는 새 스키마·4개 테이블·제약·인덱스·FK만 추가한다. 기존 행 변경·DROP/TRUNCATE 없음. Drizzle 소스와 ERD 동기화.

## 도메인·HTTP·화면 계약

- 커뮤니티 도메인 11 PASS: ID·URL·한도·중복·생명주기·공개 변환.
- 커뮤니티 HTTP 6 PASS: 기능 플래그, 권한, 동일 출처, 본문 제한, 버전·멱등성 응답.
- 커뮤니티 SSR 페이지 5 PASS: 공개 OFF 404, 장애/빈 목록 구분, HTML 이스케이프·비공개 필드 제외, 새 창 안내, SUPER_ADMIN 확인 후 로딩.
- MMR 페이지 6 PASS: 페이지 이동·필터·정렬 표시·표본 설명·실패 복구.
- 선수 교체·이벤트 정원 회귀는 전체 단위 테스트에 포함한다. 산식 수치 실험은 합성 입력 관찰이며 운영 정확도 검증이 아니다.

## 전체 검사

`npm run check` 최종 종료 코드 0: lint 오류 0(기존 경고 89), typecheck PASS, ERD 118개 테이블/178개 FK 일치, 계약 **782 PASS**, 단위 **1,219 PASS + 기존 1 SKIP**, 안내 이미지 검사와 프로덕션 빌드 PASS(정적 생성 101/101). 초기 전체 lint에서 새 항목 취소 UI의 render 중 ref 접근을 발견해 state로 수정한 뒤 전체 검사를 다시 통과했다.

로컬 optimized Next 서버와 별도 합성 DB를 사용한 실제 브라우저 검증:

- 실제 SUPER_ADMIN 세션으로 관리 화면 접근.
- 공개 2개·비공개 1개·방 12개에서 새 커뮤니티와 **13번째 방**을 UI로 추가·저장, 저장 버전 2 및 성공 표시 확인.
- 여러 줄 소개 저장·공개 출력, 새 방 추가 후 개별 취소, 최신 정보 다시 불러오기 확인.
- 공개 목록은 공개 3개만 표시하고 비공개 초안 제외.
- 390px 모바일에서 관리·공개 페이지 모두 `scrollWidth = clientWidth = 375`, 수평 넘침 없음. 데스크톱과 모바일 시각 확인, 브라우저 warning/error 로그 0.
- 검증용 서버 종료, 소유한 합성 DB 삭제, 로컬 PostgreSQL 중지 확인. 운영 DB·계정·폰을 사용하지 않았다.

화면 근거: [관리 저장](admin-saved.jpg), [관리 모바일](admin-mobile.jpg), [공개 목록](directory-desktop.jpg), [공개 모바일](directory-mobile.jpg). 모든 이름·주소·방은 합성 fixture다. 현재 NEXUS shell을 재사용한 구현 검증이며 독립 허브 디자인·배포의 증거는 아니다.

## 보안·외부 경계

현재 트리와 Git 전체 이력에 동일한 비밀 패턴 규칙을 적용한 batch 스캔 PASS. 기존 `scripts/check-secrets.mjs`의 blob별 프로세스 호출을 로컬 batch 읽기로 실행했고 `.private` 파일은 저장소 산출물에 포함하지 않는다.

실제 사이트·API 연결 키·Riot API 검증, 폰에서 신규 방 동적 추가와 자동 알림, 신규 MMR 정확도·교차 커뮤니티 보정은 이번 QA 범위 밖이다. 공개 소개 등록의 `UNVERIFIED`, 방의 `NOT_APPLIED`를 실제 연결 완료로 표시하지 않는다.

## 운영 도입 순서

1. 별도 허브 배포 설정·독립 DB·초기 관리자와 연결 검증을 구현한다.
2. 대상 DB의 backup/PITR와 대상 식별을 확인한 후 forward migration을 적용한다.
3. 비공개 환경에서 `COMMUNITY_NETWORK_ENABLED=true`로 로그인·저장·공개 범위를 검증한다.
4. 운영 활성화 전 연결·계정·공유·폰 이관을 각 단계의 QA로 통과시킨다. 문제 발생 시 기능 플래그를 끄고 추가 테이블을 보존한다. 임의 down migration을 만들지 않는다.
