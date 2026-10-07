# 1.0.6 운영 배포 후 독립 HTTP 확인

2026-10-07 12:37:58–12:38:34 KST, `visual_quality_audit`. 운영 주소 `https://k-lol-gg.vercel.app`에 쿠키·로그인 없이 GET만 요청했다. 합성 코드/UUID를 사용했고 실제 회원·관리자 데이터 조회 권한을 얻거나 쓰기 요청을 보내지 않았다. 제품 소스·공유 브라우저·서버·DB는 변경하지 않았다.

[최종 기계 기록](post-deploy-independent.json)의 선택 경계 **6 PASS**다.

| 경계 | 직접 관찰한 결과 |
|---|---|
| health | `/api/health` 200, `status=ready`, `Cache-Control: no-store` |
| 잘못된 관리자 미디어 query | `/admin/images?page=0&status=INVALID&pageSize=1`은 307로 내부 관리자 로그인에 이동. query가 보호 경계를 우회하지 않고 관리자 내용 미노출 |
| 관리자 접수 복귀 | 합성 접수 상세가 307로 정확한 내부 next를 보존. 로그인 HTML의 safe-next가 해당 경로이며 `//example.invalid/escape`는 `/admin`으로 정규화 |
| 이벤트 관리자 API | 합성 event ID의 GET이 401 problem JSON/no-store, event 데이터 없음 |
| 사용자 접수 이어하기 | 합성 `MR20000000000001007` 코드가 로그인 링크의 내부 복귀 주소에 보존됨. 익명 화면은 로그인 요구이며 새 접수 입력을 노출하지 않음 |
| 실제 배포 자산 | 운영 접수 HTML이 실제 참조한 JS를 확인. `/_next/static/immutable/chunks/11xx0_zixwz0c.js` 200/JS/immutable, 변경 문구 `팀 초안 연결` 존재, 이전 `참가자·팀 구성 연결` 없음. SHA256 `0e60b6eb777a3411ece35a922c890bba07321743cc149035563b91a3ae531b41` |

자산 경로는 추측하거나 전체 목록을 탐색하지 않았다. 운영 HTML의 script src에서만 후보를 얻었고 변경 모듈을 찾을 때까지 역순 6개 GET, 모두200이었다. 전체 번들/모든 서버 코드를 검사한 것은 아니다.

## 초기 검사 오류의 분리

[최초 결과](post-deploy-independent-initial.json)는 위5경계 PASS, 자산 검사1 FAIL이다. 최초 하니스가 별도로 빌드한 로컬 `.next/static/chunks`와 운영 `static/immutable/chunks`의 경로·바이트가 같다고 가정했다. 운영 자산을 실패로 확인한 것이 아니라 로컬 동일 경로를 찾지 못한 QA 전제 오류다. 최초 기록을 보존했고 자산 검사만 실제 운영 HTML 참조 대상으로 보정했다. 앞선5개 성공을 불필요하게 반복하지 않았다.

## 배포 식별과 확인 한계

릴리스 담당자가 전달한 검증 소스는 `0277c327cb9054ef78ca2646982d0833e234f4db`, 기능 버전1.0.6이다. 후보 `dpl_CE5PjNswZYuQFvWnU2G89B9Rtrde` 승격 후 같은 소스의 main 배포 `dpl_A9a7KUgUdaYdQe9S5vtM7sKSWyMX`가 READY/운영 alias를 가진 provider 근거는 root의 [배포 식별 기록](production-deployment.json)에 별도로 있다. 이 독립 HTTP 결과만으로 provider 배포 ID나 전체 Git SHA를 추론하지 않는다.

이 선택 범위에서 새 운영 차단이나 인증 우회는 발견하지 못했다. 실제 로그인 후 저장·업로드·설정 수정·검토 승인, 브라우저 hydration/키보드/반응형, 외부 연동·실기기는 수행하지 않았다. GET 로그인 복귀 주소의 안전성이 실제 인증 완료까지의 과업 통과를 뜻하지 않는다. root의 통합 운영 확인 및 미확인 조건과 함께 판단해야 한다.
