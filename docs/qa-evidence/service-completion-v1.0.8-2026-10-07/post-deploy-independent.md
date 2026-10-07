# 1.0.8 운영 반영 후 독립 읽기 확인

2026-10-07 22:54:40~22:56:03 KST에 `https://k-lol-gg.vercel.app`에서 인증 없는 GET만 수행했다. 최초 5건과 잘못된 검사 가정에 대한 후속 2건이며, 전체 HTTP smoke를 반복하지 않았다. 원문 HTML·개인정보·자격 증명은 저장하지 않았다.

최종 main 배포는 `dpl_BTfa4hYSa6ZR19K4Lfszsu88Lhr2`, source `653023b0f8dd1640b42afebf5e1fa3e2c7a3bee6`이다. 통합 담당자가 제공한 배포 정보를 로컬의 provider metadata 기록에서 READY·production·canonical alias·동일 source로 대조했다. HTTP 응답 자체에 commit SHA가 있다는 뜻은 아니다. 정확한 배포 근거는 [통합 기록](production-deployment.json)을 따른다.

| 대상 | 실제 관측 | 판정 |
|---|---|---|
| `/api/health` | 200, ready, no-store | PASS |
| `/admin/balance-ai` 익명 | 307, `/admin/login?next=%2Fadmin%2Fbalance-ai`, mutation form 비노출 | PASS — 원래 MMR 목적지 보존 |
| `/api/admin/balance-ai/summary` 익명 | 401, no-store, summary/generation 비노출 | PASS |
| `/` | 200, 서버 오류 표식 없음. 독립 제목 assertion은 불일치했고 아래 별도 대조에서 검사 가정 오류로 확인 | 응답 PASS, 제목 불일치 원인 해소 |
| 현재 홈 HTML에 연결된 CSS 1개 | `/_next/static/immutable/chunks/3yhtret3ggg30.css`, 200, CSS MIME, 내용 존재 | PASS — 공개 자산 연결만 확인 |

안전한 독립 결과는 [post-deploy-independent.json](post-deploy-independent.json)에 보존했다. 실행 당시 assertion과 `PARTIAL`을 사후에 PASS로 덮어쓰지 않는다. 제목 불일치의 원인은 아래 통합 담당자의 별도 확인으로 해소했으며, 인증 화면은 계속 미확인이다.

## 잘못된 검사 가정과 보존한 결과

[최초 결과](post-deploy-independent-initial.json)의 홈 제목 검사는 연속 raw HTML 문자열을 기대했다. 실제 소스는 `우리 같이`와 `롤하자~`를 span으로 나눈다. 후속 독립 검사도 공백을 포함한 예상 제목과 일치하지 않았다.

통합 담당자가 원인 확인용 GET 1회로 h1만 추출한 [heading-qa-reconciliation.json](heading-qa-reconciliation.json)을 별도로 남겼다. HTTP 200의 실제 markup은 `우리 같이<span>롤하자~</span>`, 텍스트는 `우리 같이롤하자~`로 `src/app/(public)/(home)/page.tsx:129`의 JSX와 일치한다. JSX 개행의 공백 처리와 span의 시각적 줄 구분을 raw 문자열 공백과 동일시한 검사 가정 오류이며, 제품 제목 결함으로 판단하지 않는다. 이 근거는 통합 담당자가 실행한 추가 확인이고 독립 GET 수나 독립 assertion 성공으로 합산하지 않는다.

최초 CSS 검사는 로컬 `.next`의 파일명을 운영 빌드에서도 같다고 가정해 404였다. 그 주소는 운영 HTML이 참조한 자산이 아니므로 깨진 게시 자산의 근거로 사용하지 않는다. 이후 실제 canonical HTML의 stylesheet href 하나를 추출하고 같은 origin에서 GET하여 200·CSS MIME·내용 존재를 확인했다. 이 공개 CSS 확인으로 변경된 인증 MMR 폼의 CSS나 화면 렌더링까지 검증했다고 주장하지 않는다.

## 경계

ADMIN/SUPER_ADMIN으로 로그인한 MMR·이벤트 화면, 저장·재시도·401/403 로그인 복구·412 복구·refresh 잠금의 실제 브라우저 조작은 수행하지 않았다. 공유 브라우저 도구가 native confirm 이후 멈춘 상태와 실제 운영 SUPER_ADMIN 미확인은 그대로 남아 있다. 운영 MMR 공식 전환, 최신 운영 백업/복원, 운영 mutation도 실행하지 않았다.

이 표본에서 권한 경계 실패나 서버 오류는 관측하지 않았고, 제목 assertion의 원인도 별도 근거로 해소했다. 인증 UI·실제 브라우저·운영 MMR 전환이 완료됐다고 선언하는 근거로는 사용하지 않는다.
