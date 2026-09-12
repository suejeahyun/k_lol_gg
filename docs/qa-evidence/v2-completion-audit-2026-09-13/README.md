# V2 전체 기능 검증·보완 근거

## 판정

- 기록일: 2026-09-13
- 기능 커밋: `dfb0ccb787d1602804c2019c7a87594de77d1661`
- Git tag: `v2-completion-audit-v1.0.0`
- DB migration: 없음, head `0037_swift_brood` 유지
- 운영 배포: **하지 않음** (`NOT_DEPLOYED`)
- 운영 DB 변경·삭제: **하지 않음**
- MessengerBot R 휴대폰 설치·실제 두 방 송수신: **외부 검증 대기**

현재 소스에서 이전 V2 기능을 유지하면서 팀 밸런스, 경기 결과, 플레이어 통계, 콘텐츠·이미지, 이벤트·멸망전, 관리자 권한, Kakao V1 호환, 레거시 링크와 전체 화면 QA의 남은 간극을 보완했다. 소스·빌드·합성 PostgreSQL·격리 Chromium 범위는 검증 완료로 판정한다. 실제 휴대폰, 실제 Riot 계정, 실제 Blob, Vercel Cron과 운영 배포는 이 근거에 포함하지 않는다.

세부 요구사항 판정은 [REQUIREMENTS_MATRIX.md](./REQUIREMENTS_MATRIX.md)에 있다.

## 주요 패치

### 팀 밸런스와 경기 결과

- V1 전체 후보 평가 기준을 유지하되 사용자에게는 `AI 최적 팀 추천` 한 건만 제시한다.
- `1안·2안·3안`, `교체 시작`, `끌어서 이동` 안내를 제거했다.
- 수동 배치는 드래그와 키보드 교체를 함께 유지하고, 각 카드에 주·부 포지션, 밸런스, 신뢰도와 표본을 표시한다.
- 팀 밸런스 초안을 저장·복사·재평가하고 관리자 경기 등록으로 가져가는 수명주기를 유지한다.
- 관리자 새 경기의 OCR은 기본 접힘이며, 진행 초 입력은 제거하되 기존 값은 보존하고 신규 기본값은 1,800초다.
- 육안 검수에서 발견한 경기 저장 버튼의 흰 배경·흰 글자 충돌을 수정하고 활성·비활성 대비 계약을 추가했다.

### 플레이어·경기·랭킹

- 플레이어 공개 상세에 평균 K/D/A·KDA, 신청 주/부/ALL/비선호 배치 횟수, 내전 승률과 팀 밸런스 평균 점수를 연결했다.
- 경기 상세 챔피언 이미지는 migration-safe 공식 이미지 projection을 사용한다.
- 승률·최다 참여·최다 MVP 랭킹과 MMR 전용 화면·이동 경로를 확인했다.
- 본인·관리자 Riot ID·현재 티어·최고 티어 편집, revision 충돌과 Riot 연결 보존·해제 경계를 PostgreSQL·Chromium으로 재검증했다.

### 콘텐츠·이벤트·레거시

- 콘텐츠 관리자 기본 진입은 하이라이트이며 챔피언·하이라이트·갤러리가 공통 콘텐츠 셸을 사용한다.
- 외부 갤러리 이미지도 비공개 자산과 함께 표시·삭제·정렬할 수 있다.
- 이벤트 결과 갤러리 연결과 참가자 일괄 등록을 추가했다.
- 플레이어·하이라이트·갤러리·이벤트·멸망전의 V1 숫자 링크를 DB 존재 확인 뒤 canonical UUID로 308 이동한다.
- 공개 미디어는 게시·준비 완료된 대상만 legacy 이동을 허용한다.

### Kakao

- V1 명령·응답 형식, 슬래시 유무, 양식 생성 후 작성본 저장, 수정·빈칸 취소·마감, 다른 발신자의 편집·종료를 유지한다.
- 설치본 하나가 방 이름이나 발신자 파싱 없이 `RECRUIT`와 `FEATURES` 두 프로필을 사용한다.
- 관리자 Kakao 통계에 이름 검색, 파티 수, 상태 집계, 자주 함께한 사람을 추가했다.
- 설정·로그·상태·방 권한은 `SUPER_ADMIN`만 직접 접근하고 일반 `ADMIN`에는 숨긴다.
- KST 오전 6시 일일 종료용 Vercel Cron GET 경계를 추가했다. 기존 HMAC POST 작업은 그대로 유지한다.
- 공개 V1 strict 생성본은 62,037 LF 문자, 68,768바이트, SHA-256 `a9e83edad5deadf49d782ad606ef7784bd40aa50809884fe61dca3d62dabc725`이며 비밀값을 포함하지 않는다.

### 전체 화면·릴리스 안전장치

- 공개·계정·관리자 103개 페이지를 335개 desktop/tablet/mobile·상태 조합으로 실제 렌더링했다.
- 캡처용 로그인 값은 bounded stdin으로만 넘기고 산출물에 자격증명을 저장하지 않는다.
- Windows에서 `npm.cmd` spawn 오류를 피하도록 Next CLI를 Node로 직접 실행한다.
- QA 보조 프로세스 종료 시 stdin listener를 제거하고 pause해 종료 코드 0과 임시 PostgreSQL 제거를 보장한다.
- CI 경로 필터를 제거해 모든 PR에서 DB·인증·릴리스·비밀정보 경계를 검증한다.

## 검증 결과

- `npm run check`: PASS
  - ESLint 오류 0, 생성·호환 bot의 기존 unused 경고 37
  - TypeScript PASS
  - Drizzle ERD: application schema 102 tables, 165 foreign keys, SHA-256 `7911650458777e61a3cdece988a10f26653c69618c05ca4a9beb78601e1963c4`
  - 테스트 742개 중 741 PASS, DB 전용 1개 intentional skip, 실패 0
  - 홈 여성 챔피언 아트 68/68 PASS
  - Next production build PASS, static generation 92/92
- `npm run test:db`: PASS
  - migration fresh·upgrade·idempotence, 실제 PostgreSQL 계약, 인증·계정·플레이어·시즌 HTTP/Chromium, 복구 훈련 PASS
  - recovery physical table 103개는 migration journal table을 포함하며 application schema 102개와 모순되지 않는다.
- `npm run verify:auth-http`: guards, limits, password+TOTP, cookie, roles, headers, logout, production fixture lockout PASS
- `npm run qa:capture:full`: 103 pages, expected 335, captured 335, issue 0, affected 0, 종료 코드 0
- 챔피언 이미지: Data Dragon 16.17.1의 173종·346개 URL HTTP 200 및 decode PASS
- 홈 가이드 아트: 여성 챔피언 68/68, 1672×940, duplicate 0 PASS
- Kakao: V1 strict 집중 계약 14/14, 설치 범위 11/11, V1 명령·형식 동등성 95/95, PostgreSQL V4 P0 33/33 PASS
- Rhino: ES5, warningCandidates 0, unsafe sequence 0, void expression 0, assignment condition 0
- `npm audit --omit=dev --audit-level=moderate`: 운영 의존성 취약점 0
- 현재 tree 비밀정보 검사 PASS. 전체 Git 이력 검사는 기능 커밋 전 동일 이력에서 PASS했으며 기능 커밋 전 tree 검사도 PASS했다.

전체 캡처 요약의 보존본은 [SUMMARY.json](./SUMMARY.json), 재현 방법은 [FULL_PAGE_QA_RUNBOOK.md](../FULL_PAGE_QA_RUNBOOK.md)에 있다. 원본 PNG 335장은 `.tmp/full-page-qa/screenshots`에 생성되며 개인정보와 자격증명은 포함하지 않는다.

## 외부에서 남은 검증

1. Vercel Production에 별도 `CRON_SECRET`을 32자 이상 난수로 넣고 배포한 뒤 예약 호출과 replay를 확인한다.
2. `.private`의 R8 전체 설치본을 MessengerBot R에 한 번에 붙여넣고 컴파일한 뒤 두 실제 Kakao 방에서 생성·수정·취소·마감을 확인한다.
3. 승인된 실제 사용자로 Riot RSO/API 동기화를 실행해 전적·챔피언·티어 갱신을 확인한다.
4. 실제 Vercel Blob에서 업로드·읽기·정렬·삭제와 장애 복구를 확인한다.
5. 이 기능 커밋을 Vercel에 배포한 뒤 운영 alias `/api/health`와 대표 화면 smoke를 기록한다.

## 안전상 보류

- 이름이 `test`인 플레이어 한 건은 테스트 생성 정황만 있고 운영 참조가 전혀 없다는 증거가 없어 삭제하지 않았다. 삭제 전 경기·신청·감사·연결 FK와 복구 방법을 확인해야 한다.
- Kakao 방 이름 파싱을 제거한 현재 구조에서는 잘못된 실제 방에 동일 명령을 설치하면 실행을 막을 방 식별 근거가 없다. 이는 요청한 설치본 단위 구조의 알려진 제한이다.
- 최근 솔로 20경기와 관리자 수동 보정 원천이 없으면 팀 밸런스의 해당 값은 0/미제공으로 표시된다.
- 오래된 내전 전체 양식의 동시 편집 충돌을 V1 표시 형식을 깨지 않고 탐지할 revision/base token은 후속 설계 항목이다.

