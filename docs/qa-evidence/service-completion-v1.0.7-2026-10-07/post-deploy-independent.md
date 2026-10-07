# 1.0.7 운영 후 독립 GET 확인

2026-10-07 13:03:15–13:04:10 KST, `visual_quality_audit`. 운영 `https://k-lol-gg.vercel.app`의 변경 경계3개를 익명 GET으로 확인했다. 쿠키·로그인·cron·수동 갱신·쓰기·공유 브라우저·제품 소스 변경은 없다. [최종 JSON](post-deploy-independent.json) **3 PASS**.

릴리스 담당자의 provider 확인 대상은 source `0716a60bf09654118cc40493481839d75269b3f7`, 배포 `dpl_73cLhShUqRnR9WcramzRNwDQRdAv` READY/운영 alias, 버전1.0.7이다. 이 식별 근거는 [통합 배포 기록](production.md)과 연결하며 아래 HTTP만으로 전체 Git SHA를 추론하지 않는다.

| 선택 경계 | 관찰 결과 |
|---|---|
| 홈/변경 CSS | 홈200, HTML이 참조한 CSS2개 모두200·text/css·immutable. 실제 이름 class에 `white-space:normal`, `overflow-wrap:anywhere`, `min-height:2.7em` 존재, 기존 잘림 규칙 없음. HTML class와 CSS selector 일치 |
| Riot 소유자 화면 | `/account/riot`은 스트리밍200 안에 `/login?next=%2Faccount%2Friot`로 이동하는 Next meta와 일치하는 서버 redirect signal을 제공. no-store, Riot ID/진단 등 소유자 상세 미렌더 |
| Riot 소유자 API | `/api/me/riot` 401 problem JSON·no-store, link/summary/lastSync 소유자 payload 없음 |

변경 CSS는 `/_next/static/immutable/chunks/08zqs7kj7tsag.css`, SHA256 `a4941470010fdf446def177a0145926406722a7dd24258ea790589eb53f35b55`다. 실제 HTML 참조만 따라갔으며 추측 경로/전체 자산 탐색은 하지 않았다. CSS 코드 제공 확인이며 실제 폭별 geometry·폰트·화면 클릭은 root 측정과 별도다.

최초 확인은 화면 보호를 HTTP307만으로 기대해2 PASS/1 FAIL이었다. [초기 JSON](post-deploy-independent-initial.json)을 보존했다. 실제 응답을 읽으니 `<meta id="__next-page-redirect" http-equiv="refresh" content="1;url=/login?next=%2Faccount%2Friot"/>`와 `NEXT_REDIRECT;replace;…;307;`가 일치했고 소유자 본문은 없었다. 저장소의 `requireApprovedAccountPage → requireAccountPage → redirect` 및 설치 Next의 `redirect.md` 스트리밍 규약을 대조했다. 상태 기대값만 느슨하게 바꾸지 않고 해당 화면1개만 meta/서버신호 일치·정확한 내부 next·no-store·상세 미노출 조건으로 재확인했다. 제품 인증 오류로 판정할 근거는 없었다.

이 선택 범위에서 새 운영 차단이나 인증 우회는 발견하지 못했다. 실제 인증 완료 후 한국어 진단 표시, 새 Riot 작업의 코드 저장, 실기기·스크린리더·캐러셀 조작은 수행하지 않았다. 브라우저에서 meta redirect가 완료되는 동작도 이 GET 검사와 구분한다.
