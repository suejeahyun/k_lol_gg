# 서비스 이용·관리 흐름 1.0.6 릴리스 근거

2026-10-07, source `0277c327cb9054ef78ca2646982d0833e234f4db`, tag `service-completion-v1.0.6`. Vercel main `dpl_A9a7KUgUdaYdQe9S5vtM7sKSWyMX` READY와 운영 alias `https://k-lol-gg.vercel.app`를 확인했다. Immutable: `https://k-lol-31xdw0lv0-tjdmswo11-3715s-projects.vercel.app`. [배포 metadata·health](production-deployment.json).

## 판단과 수정

[전체 18개 기능군](README.md)과 386개 실제 경로·6개 예약 작업을 기존 개별 목록과 대조했다. 서비스 목적에 필요한 참가·모집·팀·경기·전적·공유·운영 기능은 기존 구조에 있으며, 이번에는 누락된 관리 연결과 실패 복구를 고쳤다. 새 프레임워크·API·스키마·외부 제공자를 추가할 근거는 없었다. migration0047 유지.

- P2 미디어 목록: 페이지 이동과 전체 상태 조회를 복구했다. 필터와 실제 query를 일치시키고 초기화·재시도·공개 확인 링크를 제공한다.
- P2 경기 검토: 저장 중 다른 편집이 섞이지 않도록 잠그고 응답 유실 재시도 키를 유지한다. 불완전한 응답을 저장 완료로 처리하지 않는다.
- P2 해소 과제: 파일 읽기/응답 실패 뒤 입력 잠금을 풀고 서버에 저장된 이미지의 제출을 이어간다. 불확실한 raw 파일을 자동 재전송하지 않는다.
- P2 이벤트 설정: 참가 기록이 없는 준비 중 이벤트에만 기존 설정 수정 기능을 연결했다. 한국시간·revision·권한·중복 요청 조건을 보존한다.
- P3 팀 연결: 관리자가 현재 저장 팀을 명시적으로 검토 명단에 불러올 수 있다. 원래 경기 당시의 팀이라고 단정하거나 기존 입력을 덮어쓰지 않는다.
- P3 명칭: 미디어와 접수 상태를 한글로 정리하고 공개 결과로 이동을 연결했다. 입력·실패·개인정보·원본 대조에 필요한 정보는 보존한다.

홈 여섯 영역 순서, 하나의 랭킹 슬라이드와 생성 이미지·배경 테마를 유지했다. 성능 개선 수치를 새로 주장하지 않으며, 변경에 필요하지 않은 의존성 교체나 대규모 재작성은 하지 않았다.

## 실제 검증

- [필수 check](check-final.log) exit0: 계약597 PASS, 단위1055 PASS/조건부skip1, 타입·ERD·이미지68개·최적화 빌드. lint 오류0/기존 경고58.
- [인증 HTTP](auth-http-final.log) exit0. 로그인·세션·역할·쿠키·rate limit·로그아웃·운영 fixture 차단 확인.
- [새 일회성 PostgreSQL](followup-browser-final-database.log): fresh/upgrade·권한·집계·동시성·복구 계약과 최종 production build. 종료 후 cluster 중지·일회성 경로 제거·harness exit0 확인.
- [108페이지179조건](page-http-final.json) failures0. 계정 상태·필터·실패·관리자 미디어 query 복구 포함. 모든 버튼의 실제 클릭이라고 확대하지 않는다.
- 관리자 문의·이벤트·멸망전·하이라이트·갤러리·징계 [실제 저장6그룹](admin-service-write-final.json) PASS. 이 파일의 전체 passed=false는 마지막 새 QA 그룹의 코드 형식 기대 오류이며 [최초 실패](admin-service-write-first-qa-failure.json)를 보존했다. 실제 MR2 계약에 맞춘 뒤 [팀 연결 그룹만 재실행](linked-team-write-final.json) PASS. 새 접수·2이미지·검토대기·실제 관리자 HTML/Flight·익명 권한·원본 draft 보존을 확인했다.
- [실제 브라우저 과업](browser-journeys.md): 기준1.0.5에서 문의 검토/메모/완료, 미디어 작성·게시·보관과 갤러리 순서·키보드, 팀 접수·수정·2장 제출·거절·제출자 사유·검토 재개, 합성 징계 수정·취소를 확인했다. 최종 UI 클릭은 native confirm 도구 제한 때문에 통과로 표시하지 않는다.
- 실제 handler의 수정 전 실패/수정 후 통과 및 별도 담당 [독립 검토](release-inventory-independent-review.md), [이벤트 재검토](visual-independent-review.md), [교차 검토](journey-independent-review.md)를 기록했다. 해당 검토 범위에 남은 확정 P2는 없다.
- [전체 Git 비밀정보 검사](secrets-full.log)와 [배포 전 tree-only 검사](secrets-tree-final.log) exit0. 출력 로그의 끝 공백만 정리했으며 실패·결과는 보존했다.
- 운영 [공개 HTTP31조건](production-http.json) 통과. [홈 네 폭 렌더](production-layout.json)에서 가로 넘침·로딩이 완료된 이미지 누락 없음, main 하나와 영역 순서를 확인했다. viewport는 실제 innerWidth로 대조했다. 로딩 중 이미지와 로딩 후 상태를 구분했고 [운영 화면](production-home.png)을 저장했다. 실제 클릭·실기기·Web Vitals 검사를 대신하지 않는다.
- 별도 담당의 [운영 독립6경계](post-deploy-independent.md)가 통과했다. 인증 보호·내부 복귀/외부 next 차단·접수 코드·배포 HTML이 실제 참조한 자산의 변경 문구를 확인했다. 최초 로컬/운영 chunk 이름 동일 가정은 QA 오류로 분리하고 원래 실패도 보존했다. 해당 경계의 새 차단 결함은 발견되지 않았다.

## 배포와 복구 기준

후보 `dpl_CE5PjNswZYuQFvWnU2G89B9Rtrde`의 정확한 source와 READY를 provider API로 확인했다. CLI 상태 스트림의 `fetch failed`는 [원래 로그](deploy-cli.log)에 보존했고, 실제 배포 실패로 단정하거나 중복 후보를 만들지 않았다. [후보4검사](candidate-http.json) 통과 후 [운영 승격](promote-cli.log), branch/tag/main atomic push와 같은 source의 main 자동 배포 READY를 확인했다.

새5xx·권한 회귀·주요 조회/저장 장애가 확인되면 직전1.0.5 `dpl_HuMGR69n3o964U2CnZZicYHCKhW7` / source `c9431b9e68b468c17d02c6ff7595de7e14a7c9c8`를 재승격하고 해당 경로와 health를 확인한다. 이번 변경에 운영 DB migration이나 시험용 회원 데이터 변경은 없다. 현재 관측에서 복구 기준에 해당하는 회귀는 발견되지 않았다. 후속 문서 commit은 source tag를 이동하지 않는다.

## 남은 조건

1. 로컬 native confirm과 탭 클릭 도구 제한: 참가 취소→재신청, 최종 수정 UI의 실제 설정 저장/명단 불러오기·승인 등을 도구 복구 후 확인해야 한다. HTTP/handler 통과와 구분한다.
2. MMR 운영 전환: 실제 최고관리자 ADMIN 로그인 필요. 현재 V1 generation1과 미소비 변경13건, 예약 재계산409는 [운영 조회](external-runtime.md)로 확인했다. DB 자격으로 세션을 만들지 않았다. 이전 영향 분석·백업·격리 복원은 기존 근거이며 실제 전환 전 최신화가 필요하다.
3. Riot RSO client 승인/소유자 동의, 카카오 실제 설치 기기·방 송수신/ACK, 물리 기기·스크린리더·신규 사용자 관찰, 실제 OCR 정확도·최대 부하·외부 경보 수신·provider PITR/Blob 전체 복원은 미확인 조건이다. 운영 Riot 요약 갱신/마감 cron 성공과 실제 기기 성공은 구분한다.
4. 기존 개발 도구 감사12경고·lint58경고는 해결했다고 표시하지 않는다. 런타임 의존성은 이번 변경 범위가 아니다.
5. 후속 [Riot 부분 성공19건 조사](riot-partial-readonly.md)에서 원인 코드를 보존하지 않는 진단 공백을 확인했다. 외부 권한 대기로 돌리지 않고 다음 patch에서 유한·비식별 원인을 보존하는 최소 개선을 진행한다. 과거19건의 세부 원인을 소급 복원할 수 있다는 뜻은 아니다.

추가 수정이 필요 없다고 판단한 범위는 재현·수정·회귀·통합·독립 검토가 끝난 위 소스 경계다. 외부 인증과 도구·실기기 조건이 남아 있어 서비스 전체 완료 판정은 보류한다.
