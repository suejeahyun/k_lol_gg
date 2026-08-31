# K-LOL.GG 카카오 이중 키 Production 릴리스 증거

- 작성일: 2026-08-31 KST
- 후보 커밋: `8d4d2a491fd8647186502505054d68883a09a834`
- 후보 브랜치: `security/kakao-dual-secret-2026-08-31`
- 비밀값: 기록하지 않음

## 배포 전 롤백 기준

- 현재 Production 소스 커밋: `be2bed94b735669db5995b88bd111157f8f53916`
- 현재 Vercel 배포 ID: `2voN3pph3FdDDQ2kZA4NfasW43BG`
- 현재 배포 URL: `https://k-lol-q1haz7276-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- 배포 전 health: HTTP 200, `ready`, database `ok`
- 배포 전 health 관찰 시각: 2026-08-31 16:36 KST
- 배포 전 health 관찰 latency: 1083ms

## Preview 결과

- Preview 배포 ID: `5UU38FExqsfzSU2yCBghZL13qU2w`
- 결과: Build Failed
- 원인: Preview 환경에 `DATABASE_URL`이 없어 Prisma config load 단계에서 중단
- 판정: 후보 코드의 로컬 `test:ci`·`build:ci` PASS와 별개인 환경 누락. Production 환경 재배포 후 다시 판정한다.

## Production 배포

- 상태: `Ready`, Production alias 연결 확인
- 배포 ID: `GTcgeUUY8wwemLhoYjEYRMRTjQpC`
- Vercel 내부 ID 표기: `dpl_GTcgeUUY8wwemLhoYjEYRMRTjQpC`
- 배포 URL: `https://k-lol-qnefyah1s-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- 배포 소스: `8d4d2a491fd8647186502505054d68883a09a834`
- 빌드 시간: 1분 23초
- DB migration: 실행하지 않음

## 운영 검증

- health: HTTP 200, `ready`, database `ok`
- 검색 무인증: 거부 확인
- 검색 active 키: 허용 확인
- 검색 NEXT 키: 허용 확인
- 구인 무인증: 거부 확인
- 구인 active 키: 허용 확인
- 구인 NEXT 키: 허용 확인
- Vercel 신규 배포 로그: Warning 0, Error 0, Fatal 0
- 주요 자동 웜업 경로: 200 응답 확인
- 롤백 필요 여부: 현재 없음

## 키 전환 상태

- 서버 active/NEXT 중첩 수신: 운영 반영 완료
- 운영 봇 NEXT opt-in: 미실행
- 구 active 폐기: 미실행
- 폐기 보류 근거: 현재 호스트에서 ADB와 운영 메신저봇 단말 연결을 찾지 못했다. 봇 호출자를 전환하지 않은 채 기존 키를 폐기하면 운영 카카오 호출이 중단될 수 있다.
- 다음 조치: 운영 단말 연결 또는 봇 DataBase의 NEXT 값·opt-in 반영 근거 확보 후 구 active 폐기

## 판정

서버 측 이중 키 배포와 active/NEXT 운영 검증은 완료됐다. 전체 자격 증명 회전은 호출자 전환과 구 active 폐기가 남아 있어 진행 중이다. Git 이력 정리는 구 active 폐기 뒤에 수행한다.
