# K-LOL.GG V40 운영 반영 증거

반영일: 2026-08-31 (KST)

## 결론

운영 DB 백업, V40 마이그레이션, `main` 푸시, GitHub Actions, Vercel Production 배포와 운영 사이트 스모크까지 완료했다. 카카오봇 V40 파일은 검증됐지만 Android 운영 단말이 ADB에 연결되지 않아 단말 교체와 실방 테스트는 미실행이다.

## 운영 DB 백업

- 파일: `E:\k-LOL.GG\backups\production\v40-r2\klol-production-before-v40-r2-20260830T172334Z.dump`
- 크기: `3,978,517 bytes`
- SHA-256: `FF03781E76CA1D10A28522A33C9AA6B7DDAC5924081D3A700C5DF9C470C96CF6`
- `pg_restore --list`: PASS, TOC 906개
- `pg_restore --file=NUL --no-owner --no-privileges`: PASS

이 폴더의 앞선 네 덤프는 중단되거나 완전 읽기 검사에 실패한 파일이므로 복구에 사용하지 않는다. 위 파일만 V40 직전 유효 백업으로 판정한다.

## 운영 DB 마이그레이션

- 적용 마이그레이션: `20260831183000_inhouse_submission_owner_account`
- `prisma migrate deploy`: PASS
- `prisma migrate status`: 102개 모두 최신
- `submittedByUserAccountId`: nullable integer 컬럼 1개 확인
- `InhouseResultSubmission_owner_status_updated_idx`: 인덱스 1개 확인
- `InhouseResultSubmission_submittedByUserAccountId_fkey`: FK 1개 확인
- 대상 데이터: 전체 12행, WEB 0행, 소유자 보정 0행

## Git·CI·Production

- 런타임 커밋: `4f84e84aa0a4ee986c2aad2c7377d8e3bcf2e097`
- 커밋 제목: `feat: release V40 site-first registration`
- GitHub Actions `verify`: completed / success
- Actions 실행: `https://github.com/suejeahyun/k_lol_gg/actions/runs/33325365443`
- GitHub deployment ID: `6169309763`
- 환경: `Production`
- Vercel 상태: success
- 운영 URL: `https://k-lol-gg.vercel.app`

## 운영 스모크

- `GET /api/health`: 200, `ok=true`, `status=ready`, DB `ok`
- `GET /api/rankings`: 200
- `GET /api/stats/top`: 200
- `GET /api/kakao/party-recruits/status`: 200
- `POST /api/kakao/openchat` 도움말: 200
- `GET /start`: 200, `무엇을 등록하려고 하나요?` 확인
- `GET /app`: 200, viewport 메타 확인
- 비로그인 `GET /api/inhouse-results/submissions`: 401
- 비로그인 경고 사진 `POST`: 401

## Production 모바일 브라우저 검증

환경: 390×844, 운영 로그인 계정, 읽기 전용 확인

- `/start`: 목적 카드와 이어하기 동선 표시, 가로 넘침 없음
- `/account`: 경고 현황 표시, `경고 차감 사진 제출` 링크 1개, 기존 `전체 징계 통계` 버튼 없음, 가로 넘침 없음
- `/discipline/evidence`: `경고 차감 사진 한 번에 제출` 표시, 현재 본인 과제 0건 안내, 가로 넘침 없음
- `/matches/submit`: 진행일·진행자 자동 입력 안내, 입력값 6개 사전 채움, 2/3세트와 밸런스·특이사항 단계 표시, 가로 넘침 없음
- `/admin/discipline/new`: `/admin/login?next=%2Fadmin%2Fdiscipline%2Fnew` 복귀 경로 보존, 가로 넘침 없음

실제 운영 이미지 업로드는 데이터와 Blob을 변경하므로 이번 스모크에서는 수행하지 않았다.

## 카카오봇

- 파일: `KLOL_KAKAO_BOT_V40_GUIDED_HUB.js`
- 버전: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R2_2026_08_31`
- SHA-256: `C91A56A289A762FE7E08143E8FD4B55C9695C4DF68EBFCB6689613DCB73776B7`
- 로컬 구문·라우팅·고정 템플릿 검사: PASS
- 운영 단말 ADB 연결: 0대
- 단말 파일 교체·컴파일·전원 복구·실방 테스트: 미실행

운영 Android 단말을 USB 데이터 케이블로 연결하고 USB 디버깅 및 PC RSA 허용을 완료한 뒤, 기존 메인 JS 백업 → V40 전송 → 단말 해시 대조 → 컴파일 → `/봇버전`, `/등록`, `/내전등록`, `/경고등록`, `/인증` 순으로 확인해야 한다. `Database` 폴더는 비밀값 보호를 위해 가져오거나 덮어쓰지 않는다.

## 검사 제한

- `npm run check`: PASS
- `npm run check:secrets`: PASS
- `npm run check:discipline-statistics`: PASS
- `npm run check:release`: 로컬 PC에 Vercel 전용 `TOTP_ENCRYPTION_KEY`, `CRON_SECRET`, `PRIVACY_CONTACT`, Production용 최고관리자 비밀번호가 없어 환경변수 단계에서 FAIL
- 이번 변경은 Vercel 환경변수를 수정하지 않았고, 실제 Production 배포·health·핵심 API는 정상이다.
- Vercel CLI가 로그아웃 상태라 Runtime Logs는 CLI에서 확인하지 못했다.
