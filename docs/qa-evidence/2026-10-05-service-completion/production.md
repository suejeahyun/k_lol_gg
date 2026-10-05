# 서비스 이용 흐름 개선 1.0.0 — 운영 반영

- 기능 버전: `service-completion@1.0.0`
- source/tag: `73b2ee70ea7cbb4375b827ae49bb21eb70bf2dcb` / `service-completion-v1.0.0`
- 최종 Vercel 배포: `dpl_5kJJ11nQj8PjBENEoWgw9kJ7tUEx`, READY
- immutable URL: https://k-lol-hs9agqym7-tjdmswo11-3715s-projects.vercel.app
- 운영 주소: https://k-lol-gg.vercel.app
- 운영 HTTP 확인: 2026-10-05T15:18:42.288Z (10월 6일 KST)
- migration head: `0047_usage_analytics`, 스키마·운영 회원/신청/경기 데이터 변경 없음

## 배포와 운영 근거

Git archive로 고정한 소스만 배포 입력으로 사용했다. 환경 파일·비공개 파일·임시 DB·로컬 빌드 산출물은 포함하지 않았다. `--prod --skip-domain` 후보 `dpl_7s8AoY6TT4MTybkii1K2wx1jgq5r`가 READY가 된 뒤 health·홈 순서·접수 복귀·MMR·랭킹 정렬·관리자/cron 인증 경계를 검사하고 승격했다. 후보의 익명 주소는 Vercel 접근 보호 302였으므로 인증된 기존 CLI로 읽기 전용 검사했다. 앱 세션·권한을 우회한 것은 아니다. [후보 결과](candidate-http.json).

소스·태그를 main과 작업 브랜치에 push한 후, 같은 source SHA의 main 자동 배포가 READY인 것을 확인했다. 운영 alias inspect와 배포 목록의 source를 대조했다. 최종 main 배포에서 [서비스 HTTP 31개](production-service-http.json), [기본 경로 14개와 생성 이미지 MIME/SHA-256](production-http-base.json)을 재검사해 통과했다. 생성 테마·홈 여섯 영역 순서·단일 랭킹 슬라이드를 유지했다. [배포 메타데이터](production-deployment.json).

## 직접 확인한 동작

운영 공개 브라우저에서 MMR 1→2페이지, 포지션 검색과 해당 점수/표본 표시, 검색 초기화, 랭킹의 편집 중 최소 참여 25→탭 이동 후 실제 적용값 10 복귀를 확인했다. 홈 랭킹은 최다 참여자 클릭과 최다 MVP Enter 조작으로 활성 슬라이드가 바뀌었다. 특정 접수 코드의 로그인 링크는 동일 코드를 `next`에 보존했다. 콘솔 error/warn은 확인한 탭에서 0개였다.

홈·신청·결과 제출 진입·팀 밸런스 진입·시즌 랭킹·MMR의 6개 공개 화면을 320/390/768/1440px에서 검사했다. 24개 조건에서 문서 가로 넘침, 중복 ID, 이름 없는 조작, 16px 미만 모바일 입력, 깨진 이미지/누락 alt는 발견되지 않았다. 이것은 DOM 기초 검사이며 모든 화면의 시각·스크린리더·실기기 인증을 뜻하지 않는다. [브라우저 결과](production-browser.json).

로컬 합성 계정의 회차 전환과 ARAM 신청 저장은 직접 확인했다. 로컬 취소 확인창 이후 그 브라우저 세션의 저장 검증은 도구 응답 중단으로 끝내지 못했다. 운영 공개 도메인에서는 별도 탭의 탐색과 위 검사가 정상 수행됐지만, 이 사실로 로컬 접수 생성→새 접수·취소 완료를 통과 처리하지 않는다. [직접 조작과 한계](browser-observations.md).

## 검사와 별도 재검토

최종 `npm run check`: 계약 463개·단위 1,045개 통과, 조건부 skip 1개, lint 오류 0·기존 경고 58개, 타입·ERD·이미지·production build 통과. 전체 격리 PostgreSQL 18 계약/HTTP·백업 복구, 인증 경로 169개, 변경 TSX handler/렌더 회귀와 비밀정보 검사를 통과했다. 검증 로그의 끝 공백만 Git 저장을 위해 정규화했다. [전체 결과와 문제별 수정](README.md).

별도 재검토에서 추가 발견한 생성 후 화면 전환 경합까지 수정했고 회귀의 수정 전 실패→수정 후 통과를 확인했다. 그 뒤 검토한 범위에서 미수정 중대 결함이나 새 핵심 과업 방해 요소를 발견하지 못했다. [독립 검토](independent-review.md). HTTP 통과 수를 전체 버튼 E2E 수로 해석하지 않는다.

## 남은 정책·외부 조건

- 운영 MMR은 기존 `V1_INTERNAL_MMR_1` 결과를 보존 중이다. 마지막 집계는 2026-09-08 KST, MMR 미소비 변경 이벤트는 13건으로 관측했다. 실패 13건/경기 13개를 뜻하지 않는다. 공식이 다르면 자동 갱신을 중단하는 기존 계약이며, 최신 반영 완료로 판단하지 않는다. 새 공식 영향 검토와 운영자 결정 후 SUPER_ADMIN 전체 재계산, 점수 대조, 후속 cron 확인이 필요하다. 이번에 수식이나 기존 점수를 임의 전환하지 않았다. [MMR 운영 절차](../../operations/MMR_PROJECTION_RUNBOOK.md).
- 실제 Riot/Blob 공급자 왕복, Kakao 휴대폰 봇 송수신·절전·재시작, 외부 알림 수신, provider cron의 최근 실제 실행 결과, 검색 서비스 소유권은 미확인이다. 운영 데이터로 쓰기 테스트하거나 외부 발송하지 않았다.
- 실제 iPhone/Safari·Android 설치 앱·스크린리더 전체 조합, 신규 사용자 과업 성공률, 이동통신 성능과 최대 규모 부하는 미측정이다. HTTP 단일 요청 시간으로 성능 향상을 주장하지 않는다.

기존 참가·모집·팀·제출·기록·관리자 기능군에는 새 기능을 추가해야 해결되는 공백을 확인하지 못했다. 현재 과업의 문맥과 복구를 연결하는 수정으로 범위를 제한했다. 새로운 채팅·모집 작성 시스템·공급자와 추측성 캐시/쿼리 최적화는 필요 근거가 없어 추가하지 않았다.

## 복구

[직전 READY 배포](rollback.json) `dpl_6sT2FPF3ik26uwqdHDSh1sAExQC4`가 복구 기준이다. 핵심 5xx·권한 회귀·잘못된 신청/접수 문맥·랭킹 정렬 문제가 나타나면 해당 배포를 재승격하고 공개 smoke를 확인한다. DB 변경이 없어 down migration이나 사용자 데이터 삭제는 필요하지 않다. 배포 근거 문서 커밋은 고정한 source tag를 이동하지 않는다.
