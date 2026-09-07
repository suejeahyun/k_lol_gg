# K-LOL.GG V2 상태

- 기준 커밋: `491b302` (`main`, 2026-09-07)
- 현재 단계: S00~S04 로컬 구현 후보 통합 완료, W2 S05·S06 병렬 구현 중
- V1 코드 복사: 없음. V1은 동작 명세와 동등성 대조 근거로만 사용
- 운영 데이터·외부 연동: 연결하지 않음
- 운영 Vercel 전환: 하지 않음
- 전체 기능 동등성: **미완료**

## 확인된 완료 범위

- 독립 Next.js 코드베이스, 밝은 Community Breeze 토큰, 반응형 사용자 셸
- V2 전용 아리 히어로 이미지와 자산 해시 기록
- V1 사용자 UI 73/73, 관리자 UI 81/81, 비관리자 경계 Route Handler 112/112 전수 목록
- 플레이어 검색 포트·fixture·PostgreSQL 공개 projection 저장소 계약
- PostgreSQL 전진 migration, transaction, 인증·registry·audit schema와 repository
- 비운영에서만 허용되는 합성 계정의 비밀번호 → TOTP → HttpOnly 세션 검증
- 익명 관리자 차단, ADMIN 역할·상태·authVersion 재검증, 로그인·로그아웃 Origin 검사
- 보호된 관리자 10개 작업 공간 A0 셸과 데스크톱·모바일 시각 QA
- `npm run check` 통과: 계약 17개, 단위 101개와 production build 통과
- 격리 PostgreSQL 18 계약 14/14 통과, 임시 cluster 정상 종료·경로 제거
- 실제 HTTP 관리자 인증 검증 통과, 런타임 `npm audit --omit=dev` 0건
- DB 기반 관리자 TOTP status/setup/enable/self-disable UI·API와 one-time setup secret 계약
- TOTP enable/disable의 `authVersion + 1`·전체 session revoke·audit append 원자 transaction
- 동시 enable/disable 단일 승자, audit 실패 rollback, 변경 전 cookie 401의 격리 PostgreSQL·실제 HTTP 검증
- production cookie `Secure` 강제, JWT decode 8 KiB 상한, Vercel/public origin fixture 차단
- 사용자 가입·로그인·로그아웃·비밀번호 변경·초기화 요청과 계정 상태/플레이어 claim 화면
- 관리자 계정 목록·상세·승인·거절·제한·삭제·복구·역할·TOTP·임시 비밀번호 수명주기
- 일회성 임시 비밀번호의 화면 이탈·BFCache·revision 경쟁 조건 폐기와 과거 projection 차단
- S02 플레이어 등록부와 S03 시즌·참가 mutation에 공통 transaction session guard 적용
- S04 경기·결과 aggregate, 공개 목록·상세, 사용자 비공개 접수, 관리자 등록·검토·게시·무효화·복구
- S04 `0005` migration, 참가자 표시 snapshot, private image/OCR 검토 saga, audit/outbox와 무결성 검사
- S06 seed 재생 가능한 랜덤 팀·편향 없는 shuffle·결정적 티어 최소차·코인토스 상태 머신 기반

## 출시 차단 조건

- 운영 migration·cleanup scheduler·관측/경보·WAF/신뢰 IP·backup/restore 훈련
- 사용자 73개 및 관리자 81개 V1 기능의 정상·빈 상태·오류·권한·mutation 동등성
- 운영과 분리된 전체 E2E fixture DB에서 ADMIN/SUPER 권한 검증
- 전체 반응형·키보드·스크린리더·감소된 모션·성능 예산·복구 훈련
- Riot/Kakao/Discord/Blob/APK 계약과 승인·서명·보존 정책의 운영 전 검증
- 비밀정보 검사와 깨끗한 Git 상태, 원격 대상 확인

## 알려진 위험

- 개발 전용 `drizzle-kit` 하위 esbuild advisory 4건(중간). 런타임 의존성은 0건이며, 제안된 강제 수정은 큰 하위 버전 변경이라 별도 호환성 검증 전 적용하지 않는다.
- S01~S03은 로컬 구현 후보이며, 전체 기능을 합친 뒤 DB/HTTP/브라우저 회귀검증을 다시 수행하기 전에는 최종 검증 완료로 간주하지 않는다.
- S01의 기존 QA 이미지 114장 중 파일명/화면 불일치 2장과 변환 후 메타데이터 불일치 39장이 확인되어 최종 통합 QA에서 재촬영·재생성한다.
- 합성 fixture는 명시적으로 켠 loopback 비운영 환경에서만 허용되고 Vercel/public origin에서는 차단되며, 운영 인증 대체 수단이 아니다.

## 다음 순서

1. W2: S05-A 통계 projection·랭킹과 S06 공개 팀 도구를 병렬 구현한 뒤 S05-B MMR·draft 연결
2. W3~W5: S07~S13을 병렬 웨이브 단위로 구현하고 동등성 표를 갱신
3. S14에서 전수 DB/HTTP/브라우저·접근성·반응형·성능·보안·복구 검증과 QA 증거 재생성
4. 중요 결함과 미완료 기능이 0이고 비밀정보 검사가 통과한 뒤에만 Git 원격 브랜치 push
5. 운영 Vercel 전환과 운영 데이터 변경은 이 계획에서 수행하지 않음
