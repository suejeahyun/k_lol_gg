# 1.0.4 운영 반영 후 독립 표본 확인

2026-10-06 10:27 KST. 통합·배포 담당자와 별도로 기존 Vercel 인증의 읽기 전용 metadata 조회와 운영 주소의 익명 GET 5개를 실행했다. 제품 소스·운영 계정·신청·경기·권한·배포는 변경하지 않았다. 정제한 시각·응답·판정은 [post-deploy-independent.json](post-deploy-independent.json)에 있다.

## 결과

지정된 배포/운영 표본은 모두 통과했고 새 중대 오류나 이번 변경을 막는 결함을 발견하지 못했다. 이 표본을 전체 기능의 모든 상태가 실행됐다는 주장으로 확대하지 않는다.

| 범위 | 실제 확인 |
| --- | --- |
| Provider / source / alias | Vercel deployment API의 GitHub source는 `583dab4d3793b1bb00de92c2ea2fd4ad21a2e04d`. `dpl_61srgiX3pqpT8ZBygBHzPLj8S468`는 `READY`, production. 별도 canonical inspect도 같은 ID/READY로 일치 |
| `/api/health` | HTTP 200, `ready`, `no-store`. 이 API가 확인하는 DB 연결 경계이며 모든 외부 연동·cron 실행 성공을 뜻하지 않음 |
| `/login` | HTTP 200, 서버 HTML의 관리자 로그인 링크 1개, 아이디/비밀번호 입력 유지. 중복 기본 승인 상태 설명 없음 |
| `/competitions/destruction` | HTTP 200. 빈 전체 선택을 제외한 8개 format 값과 8개 한글 이름이 각각 고유함. 전체/조별/스위스/랜덤과 단판/3판 2선승 구분 유지 |
| `/api/admin/users` | 쿠키·인증 없이 HTTP 401, `ACCOUNT_AUTH_REQUIRED`, `no-store`; 응답에 계정 목록/data 없음. 관리자 로그인·mutation은 시도하지 않음 |
| 없는 공개 주소 | `/qa-independent-missing-20261006-v104`는 HTTP 404. 서버 HTML의 복구 제목·홈 링크, main/header/footer 각각 1개 |

운영 주소는 [k-lol-gg.vercel.app](https://k-lol-gg.vercel.app), 개별 배포는 [k-lol-637qb7v21](https://k-lol-637qb7v21-tjdmswo11-3715s-projects.vercel.app)이다. 후보 승격 절차를 다시 실행하지 않았으며 위 최종 main 배포와 alias를 직접 대조했다. metadata의 환경값·작성자 등 불필요한 원문은 이 문서나 JSON에 저장하지 않았다.

## 기존 검증과 구분

- 이번 담당은 운영 HTTP 5개만 실행했다. 통합 담당자의 [31개 서비스 HTTP](production-service-http.json), [14개 경로/11개 자산](production-http-base.json)을 재실행하거나 자기 실행 결과로 세지 않았다.
- 통합 담당자의 운영 브라우저 홈 1280/768/390/320px 관측과 MVP 직접 선택은 별도 실행이다. 저장된 [운영 DOM 기록](production-layout.json)은 320/390/768px의 overflow 없음·main 1개와 로그인 관리자 링크 1개를 담는다. JSON에 없는 1280px/버튼 조작을 이 파일의 직접 관측으로 표시하지 않는다.
- 변경 기능의 합성 브라우저 과업은 [browser.md](browser.md), 필수 검사/전체 기능 원장/교차 검토는 [README.md](README.md)를 따른다. 이 검토자는 관리자 문구 구현에도 참여했으므로 자기 정적 소스 검토를 독립 교차 검토로 중복 산정하지 않는다. 관리자 변경의 별도 담당자 검토는 [independent-review.md](independent-review.md)에 있다.

## 남은 경계

HTTP 서버 HTML은 hydration 이후 DOM·키보드·스크린리더·실기기 동작을 대신하지 않는다. 이번에는 운영 인증 쓰기, 실제 제출/신청/회원 변경, 외부 메시지 송수신, 실제 OCR·Riot RSO, MMR 재계산, 장시간 부하·runtime 로그 전체·외부 경보·복구 실행을 하지 않았다. [외부 실측](../service-followup-2026-10-06/external-runtime.md) 및 [MMR 전환·복구 조건](../service-followup-2026-10-06/mmr-transition-review.md)은 계속 별도 항목이다.

위 변경 범위와 관측 표본에서는 추가 소스 수정이나 같은 HTTP 검사 반복을 정당화할 새 결함을 발견하지 못했다.
