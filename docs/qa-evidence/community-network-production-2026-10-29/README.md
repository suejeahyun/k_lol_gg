# NEXUS 커뮤니티 등록·대회 MMR 운영 반영

2026-10-29 (Asia/Seoul). 사용자가 “운영 배포까지”를 요청한 범위의 후속 배포 기록이다. 이전 [로컬 검증 기록](../community-network-2026-10-29/README.md)은 해당 시점의 미배포 근거로 보존한다.

## 대상과 변경

- NEXUS Vercel 프로젝트 `nexus-gg` / `prj_qozFsYmEO7ZoL0jZAnBNCVc1nF8i`.
- 운영 주소 `https://nexus-gg-kr.vercel.app`.
- 소스 `5fe9ac98ccf676c56502101b91a560bd64a4f965`는 검증한 `28791243`에 릴리스 문서만 추가한 동일 런타임이다.
- 기능 버전: `community-network-registry@0.1.1`, `competition-mmr-integrity@1.0.1`. 운영 전환 근거를 새 버전으로 기록한다.
- 커뮤니티 등록/공개 목록, 선수 교체 평가 초기화, 10명 이벤트 정원, 포지션 MMR 정렬, 표본 충족도 설명을 배포한다.
- K-LOL 프로젝트와 DB, 현재 휴대폰 설치본, Riot 활성화 설정을 변경하지 않는다. 독립 중앙 허브와 실제 사이트 간 공유·동적 폰 연결은 이번 배포 대상이 아니다.

## DB 백업·복구와 migration

NEXUS Neon 프로젝트 `steep-forest-46215218`, DB `nexus_gg`를 기존 Vercel 운영 환경의 DB 대상과 대조했다. 다른 사이트의 `DATABASE_URL`이 없는 독립 구성을 확인했다.

읽기 전용 repeatable-read snapshot을 export해 PostgreSQL 18 custom archive를 만들었다. archive는 ignored `.private/recovery/community-network-20261029/`에만 보관한다. 운영 데이터 원문과 접속값은 이 문서에 포함하지 않는다.

- archive: `nexus-before-0050-f05aacada96d4c11.dump`, 499,523 bytes.
- SHA-256: `15ed1f3ad05391dce106eb5fa5dde2b76a4a172b625005ec5f186439227863a3`.
- 별도 loopback 복원 DB에서 115개 테이블의 행 수, 3,665개 구조 정의, FK 검증 상태, 기존 migration 50개의 hash/시각이 원본 snapshot과 일치.
- 로컬 복원본에 새 migration과 재실행을 검증하고 소유한 복원 DB만 정리.
- `0050_community-network-registry` SQL SHA-256: `2900fe4fcec43b787ca3e8b5cd1aade19cb51aa976378335ef38ce17c43313b9`.
- 운영 적용은 단일 연결 advisory lock, lock timeout 5초/statement timeout 30초, 대상·원본 head·검증 archive 대조 후 수행.
- 운영 migration 50→51, 재실행 no-op, 기존 구조 보존, 새 테이블 4개는 빈 상태. 적용 전후 기존 테이블 행 수 변화 없음, 스크립트의 기존 업무 행 쓰기 0.
- 제공자 PITR 복원을 실행했다는 의미는 아니다. 상세 비밀값 없는 결과는 `database.json`에 기록한다.

## 환경과 배포 입력

`COMMUNITY_NETWORK_ENABLED=true`만 production에 추가했다. 기존 전체 환경 파일을 재업로드하지 않았으며 다른 설정의 ID·대상·타입·값 hash가 그대로임을 대조했다. 카카오 알림/cron은 기존 ON, Riot 외부 연동은 기존 OFF를 유지했다.

Vercel dry-run 배포 입력 1,789개/59,567,567 bytes를 검사했다. `.private`, `.tmp`, 실제 `.env*`, DB archive, QA 자료는 제외했으며 공개 placeholder `.env.example`만 포함했다. 새 migration과 API 소스 포함을 확인했다.

## 배포 검증

최종 deployment `dpl_nnAwySycvaNVhApHqEdqzXufvn19` **READY**, source `5fe9ac98ccf676c56502101b91a560bd64a4f965`. [운영 주소](https://nexus-gg-kr.vercel.app)와 [immutable 배포](https://nexus-beic6v1r9-tjdmswo11-3715s-projects.vercel.app)를 확인했다. `--prod --skip-domain` 후보의 HTTP 10조건 통과 후 `vercel promote`로 운영 alias를 전환했고, 운영 주소에서 동일 10조건을 다시 통과했다. [최종 근거](production.json), [후보 근거](candidate.json).

후보는 Vercel 인증으로 보호되어 최초 비로그인 요청은 302였다. 공식 CLI 자동화 인증으로 검사하고 임시 검증 자격을 바로 폐기했다. 기존 보호 설정은 유지했다. [폐기 근거](candidate-credential-cleanup.json). 관리자 기능은 애플리케이션의 기존 로그인이 별도로 필요하며 보호 우회 자격으로 관리자 권한을 만들지 않았다.

운영 HTTP는 홈 브랜드, DB health ready, 디렉터리의 정상 빈 상태, MMR 표본 설명, 선수/모집/관리자 로그인, 비로그인 관리자 API 두 경로 차단, Riot 소유 확인 파일 보존을 검증했다. 카카오 서버의 서명된 읽기 전용 상태/도움말 진단은 RECRUIT/FEATURES 각 2개, 총 4 PASS다. 실제 채팅 메시지는 발송하지 않았다. [카카오 서버 근거](kakao-server.json).

실제 브라우저에서도 운영 목록의 정상 빈 상태와 관리자 로그인 이동을 확인했다. [화면](directory-production.jpg), [브라우저 결과](browser.json). 독립 중앙 서비스가 완성됐다는 의미는 아니다.

관리자 저장의 실제 성공은 격리 DB/브라우저에서 검증했다. 운영 계정을 가장하거나 운영 자료를 시험용으로 작성하지 않는다. 운영에서는 공개 화면·정상 DB 상태·비로그인 API 차단·관리자 로그인 경계를 확인한다. 사이트 간 통합과 신규 MMR 산식의 성능은 이번 검증 대상이 아니다.

## 복구

직전 정상 배포는 `dpl_2YMxonJLnzyr81aCYyPS4CasSggh`, 소스 `4bb8f7a3bfc9fb2ca2e642fc140c221d0fc6ef3a`다. 장애 시 이전 READY 배포를 NEXUS 프로젝트에서 재승격한다. 추가 테이블은 이전 앱과 호환되므로 보존하며 임의 DROP/down migration을 하지 않는다. 기능만 중단할 때는 플래그 OFF 후 재배포한다. 백업 복원은 백업 이후 실제 쓰기의 손실 범위를 평가한 별도 복구 작업이다.

## 로컬 미리보기

사용자 요청으로 공개 목록과 관리자 화면을 Codex 브라우저에 열어두었다. loopback의 별도 합성 DB이며 운영 자료와 연결하지 않는다. 실행 중인 origin은 ignored `.private/community-network-preview-state.json`에 기록된다. 미리보기는 현재 NEXUS shell을 재사용하며 독립 중앙 서비스 배포를 뜻하지 않는다.
