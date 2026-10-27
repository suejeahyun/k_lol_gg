# NEXUS.GG 운영 시작

실행 요구사항은 [확정 프롬프트](NEXUS_IMPLEMENTATION_PROMPT.md)에 있다. NEXUS는 동일 기능 코드에서 `NEXT_PUBLIC_SERVICE_ID=nexus`로 빌드하며 별도 DB와 세션·봇 키를 사용한다. 기본값 `klol`은 기존 동작을 유지한다.

## 배포 대상

- 사용자 확정 주소: https://nexus-gg-kr.vercel.app
- Vercel 프로젝트: `nexus-gg` / `prj_qozFsYmEO7ZoL0jZAnBNCVc1nF8i`
- Neon 프로젝트: `NEXUS-GG` / `steep-forest-46215218`, PostgreSQL 18, Singapore
- DB: `nexus_gg`; `NEXUS_DATABASE_URL`만 설정한다. 기존 `DATABASE_URL`은 복사하지 않는다.
- 전용 비공개 파일 저장소: `nexus-gg-private` / `store_tbb4Y4TdizWavAiY`
- 휴대폰 방: `NEXUS`, `NEXUS 구인구직방`

실제 배포 ID·검사 결과는 `docs/qa-evidence/nexus-2026-10-27/`에 기록한다. 리소스 생성만으로 사이트·휴대폰 운영 완료를 의미하지 않는다.

## 새 DB 초기화

기존 자료를 복사하지 않는다. 소유가 확인된 새 DB와 독립 환경 파일에 대해 순서대로 실행한다.

```text
node --env-file=.private/nexus-migration.env --import tsx scripts/nexus/bootstrap.ts
node --env-file=.private/nexus-migration.env --import tsx scripts/nexus/seed-reference.ts
node --env-file=.private/nexus-migration.env --import tsx scripts/nexus/create-admin.ts
```

초기화는 DB 이름과 서비스·생성 확인값을 검사하고 기존 업무 자료가 있으면 거부한다. 50개 migration의 구조·3개 기본 설정만 먼저 만들고, 공식 Data Dragon 16.17.1 챔피언 기준 목록 173개를 별도로 추가한다. 플레이어·시즌·경기·모집 자료는 생성하지 않는다. 참조 목록을 넣은 뒤 빈 DB bootstrap을 다시 실행하지 않는다. 이후 스키마 업그레이드는 일반 전진 migration 절차를 따른다.

최초 관리자 명령은 계정이 하나라도 존재하면 거부하며 기존 계정을 승격하거나 수정하지 않는다. 임시 관리자 접근 정보는 ignored `.private/NEXUS_ADMIN_ACCESS.txt`에만 보관한다. `/login` → `/account/password`에서 임시 비밀번호 변경 → `/admin/login` 순서로 시작한다. 현재 서비스는 비밀번호 인증을 사용하며 폐기된 TOTP 화면으로 안내하지 않는다.

관리자는 첫 시즌을 직접 생성·활성화한다. 활성 시즌을 만들기 전에는 내전 신청을 저장할 대상 시즌이 없으며, 기존 커뮤니티 시즌은 가져오지 않는다.

## 휴대폰 설치

[NEXUS 폰 설치 안내](../../integrations/messengerbot-r/nexus/README.md)를 따른다. 기존 K-LOL 프로필은 기존 방만 구독하고, 새 `NEXUSMain` 프로필은 NEXUS 두 방만 구독한다. 실제 비공개 산출물 전체를 붙여 넣는다. 공개 파일에는 인증 설정이 없어 설치본으로 사용할 수 없다.

일반 봇과 알림 companion의 파일·설정·전송 ledger가 분리된다. 알림 companion은 새 `NEXUSNotice` 프로필과 일회용 수신 방 등록이 필요하다. 비공개 `.private/NEXUS_PHONE_INSTALL.md`의 해당 설치본 등록 명령을 사용한다. 등록 전에는 알림을 전송할 세션이 없다. 설치·두 서비스 간 교차 응답·실제 충원 알림은 휴대폰에서 확인한 뒤 완료로 기록한다.

## 환경과 유지보수

- 개발: `.env.nexus.example`을 참고하고 별도 local DB를 사용한다. 현재 로컬 주소는 http://localhost:3107 이다.
- `NEXT_PUBLIC_*` 브랜드·주소를 바꾸면 새 빌드가 필요하다.
- 인증 키, V4 identity/signing 키, cron 키는 각각 독립 발급한다. DB URL·private 봇 소스·관리자 비밀번호를 Git이나 채팅에 넣지 않는다.
- Riot 외부 API·RSO, OpenAI 등 선택 연동은 해당 NEXUS 환경의 키·콜백·플래그 설정 후 활성화한다. 키를 설정하지 않은 기능을 연동 완료로 표시하지 않는다.
- 운영 전환 시 `.private`, `.env*`, 로컬 DB·로그가 배포에 포함되지 않는지 `vercel deploy --dry --json`으로 확인한다.
- 복구는 NEXUS 프로젝트의 이전 정상 배포 또는 새 전진 수정으로 수행한다. K-LOL 배포·DB를 변경하지 않는다.

## 검증

```text
npm run check
node scripts/check-secrets.mjs --tree-only
node --env-file=.env.local --import tsx scripts/nexus/verify-empty-database.ts
node --env-file=.env.local --import tsx scripts/nexus/verify-auth-http.ts
```

두 DB 검증 스크립트는 loopback에서 별도 일회용 DB를 생성·삭제하며 Neon 또는 운영 자료를 검증용으로 지우지 않는다.
