# R24 파티 양식 정리 — 1.0.1

요청: 사용자가 제시한 파티 양식처럼 제목·시작·게임·빈 참가 칸·예비·양식코드만 표시한다. **휴대폰 봇 코드를 추가 변경하지 않아도 되면 진행**이라는 조건으로 서버 수정·운영 반영을 승인했다.

## 변경 범위

- 서버 `v1-strict-party-replies.ts`의 `compactCopyForm`에서 중간 참가 안내줄과 양식코드 뒤 `(그대로 두세요)`를 뺀다.
- 게임 정보 뒤 빈 줄 3개, 본 참가/예비 사이 빈 줄 1개로 사용자 예시에 맞춘다.
- 생성·상세·저장 후 최신 양식은 같은 renderer를 사용한다. 도움말과 사이트 안내에서 복사 방법을 계속 확인할 수 있다.
- 모집 정보, 이름, 예비 번호, 양식코드와 사이트 연동 저장 정책은 유지한다. DB migration과 운영 명단 직접 변경은 없다.
- 휴대폰 버전은 기존 R24 그대로다. 공개·private 설치본 파일을 수정하지 않으며 추가 교체를 요구하지 않는다. 실제 설치폰 버전을 원격으로 확인했다는 의미는 아니다.

## 검증

- 기존 출력 계약·양식 재파싱·참가명단 보존 검사: **46/46 PASS** (`focused.log`). 새 구현을 따라가는 테스트를 추가하지 않고 기존 생성 양식 기대값을 갱신했다.
- 전체 `npm run check`: exit 0; 계약 410/410, 단위 862 PASS·DB 전용 1 skip, 타입·ERD·프로덕션 빌드 PASS. lint 오류 0·경고 326 (`npm-check.log`).
- 기존 봇 산출물 SHA-256: `before.json`, 검증 후 공개·private 모두 동일 (`installer-unchanged.json`).
- 로컬 실제 출력 예시: `FORM_EXAMPLE.txt`.
- 폰 코드 호환성: `phone-compatibility.md`.

## 배포

- 운영 반영: 2026-09-21 11:29 KST 확인. Vercel `dpl_8jtg4dY911S3RAEjvtv9gv7nQa56`, `READY` · `production`.
- 소스 commit: `33d7bf042ffda9f051588787d0cffb1a1ff7f71a`, tag: `kakao-r24-site-linked-copy-v1.0.1`. 기능 브랜치와 tag를 원격 저장소에 push했다.
- 운영 URL: https://k-lol-gg.vercel.app · 고정 배포 URL: https://k-lol-h7c7vnyx0-tjdmswo11-3715s-projects.vercel.app.
- `production-after.json`의 배포 ID·alias와 `deployment-source.json`의 제공자 API 소스 commit·기능 버전이 일치한다. 배포 로그는 `vercel-deploy.log`.
- 운영 확인: health `ready`, 인증된 카카오 도움말·내전 안내·파티/내전 현황, 웹 도움말·모집 페이지 **8/8 PASS**, HTTP 200 (`live-production.json`).
- 상세 양식 2건은 현황 응답에서 조회 대상을 선택하지 못해 생략했다. 정확한 양식 출력·파싱은 로컬 검사 근거이며 실제 채팅방 수신이나 운영 명단 저장까지 확인했다는 의미는 아니다. 검증용 운영 모집 생성·명단 변경은 하지 않았다.
- 이번 배포의 DB migration·휴대폰 산출물 변경은 없다.

복구 기준은 작업 시작 시 실제 운영 alias가 가리킨 `dpl_6ZtchrtMHPisXZWNTeoR7HZ6GQCC`다. 서버만 되돌릴 수 있고 DB 역변경·휴대폰 교체는 필요하지 않다.

## 남은 확인과 다음 패치 추천

실제 사용자의 휴대폰 설치 버전과 채팅방 송수신은 원격 확인되지 않았다. R24 산출물은 이번 안내 없는 양식을 기존 전달 경로로 처리한다. 구형 R22는 화면 응답은 출력하지만 작성된 짧은 양식을 다른 프로필로 보낼 수 있어, R22까지 사이트 복사 저장이 보장된다는 뜻은 아니다. 이번 패치는 R24 휴대폰 파일에 추가 변경을 요구하지 않는다.

1. **빈 모집 취소**: 현재 `번호ㅉ`는 진행 중 모집만 대상으로 하므로 미게시 DRAFT를 명시적으로 취소하는 흐름을 보완한다.
2. **회원 확인 후 신청 연결**: 미등록·동명이인 확인 대기에서 가입 후 기존 신청을 연결하는 동선을 줄인다.
3. **만료 양식 원본 정리**: 요청당 최대 256건 정리 외에 무트래픽 상태의 보존기간 관리가 필요하다.

공지: [DISCORD_NOTICE.md](./DISCORD_NOTICE.md). 외부에 게시하지 않았다.
