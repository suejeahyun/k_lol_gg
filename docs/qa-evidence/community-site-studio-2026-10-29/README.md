# GG HUB 개설 스튜디오 검증

기능 버전: `community-site-studio@0.1.0` · 2026-10-29

## 범위와 현재 상태

중앙 회원 가입, 사이트 신청·심사·보완·재제출·취소, 세 테마와 기능 설정, 독립 DB·배포 개설 작업, 중앙 로그인 연결, 설정 게시와 소유자 공개 확인 흐름을 구현했다. GG HUB 운영 배포와 migration·자료 보존을 확인했다. **전용 Vercel 자동 개설 토큰은 사용자 로그인 대기이며, 운영 HUB의 승인·자동 개설은 아직 비활성이다.** 신청·보완·테마와 기능 설정 화면은 운영 중이다. 개별 공급자·자식 사이트의 시험과 운영 HUB의 자동 승인 활성화를 구분한다.

운영 source `dd71d851ce18473b1d9a89703374fe5cbc9bf46b`, deployment `dpl_CHNC2L1CAvuBeyYMhDivs3fR1AW6`, [GG HUB](https://gg-community-hub.vercel.app). [후보 검사](candidate.json)와 [운영 검사](production.json)는 각각 28개 PASS이며 정확한 source·READY·운영 alias와 인증된 비활성 cron의 정상 대기 응답을 확인했다. 후보 검증용 임시 접근 키는 철회했다.

제휴·공유 모집·공동 대회·운영 기록 교환·기존 사이트 본인 계정 연결·휴대폰 동적 방 라우팅은 후속 단계이며 이 버전의 완료 주장에 포함하지 않는다. 기존 K-LOL/NEXUS 운영 DB·배포와 휴대폰 설치본은 변경하지 않는다.

## 이미 확보한 근거

- [HTTP 검사](http.json): 일회성 loopback PostgreSQL과 실제 Next 서버에서 64개 검사 통과. 일반 USER 가입·로그인, 소유권·CSRF·재전송·revision·지원 기능 검증, 보완·재신청·취소, 공급자 미설정 승인 차단, 공개 자료 최소화, 세션 회수.
- [최종 브라우저 검사](browser/report.json): 63/63, 11개 화면의 1440/390/320px 접근성 위반·가로 넘침·JS 예외·외부 요청 0. 중앙 가입·로그인, 세 테마, 기능 의존성·중지 영향 확인, 신청·초안·보완·재제출을 검증했다. `browser-initial/`과 `browser-a11y-before.json`은 수정 전 진단이며 통과 증거가 아니다.
- 격리 PostgreSQL: 최종 0051의 fresh 1 + upgrade/baseline 8 + repository/worker 12 + child bootstrap 7 = 28/28. 공개 쓰기 성공 후 응답 유실·소유자 중지·관찰 전용 복구와 쓰기 전 권한 중지 시 비공개 유지도 포함한다.
- [실제 두 사이트 SSO](auth-sso.md): 최종 스키마의 서로 다른 HTTPS origin과 운영용 빌드로 8단계 검증, exit 0. Strict 쿠키, 소유자 전용 미리보기, 관리자 비밀번호 재확인, 일반 회원 PENDING·프로필 입력·실제 운영진 승인·첫 모집 작성을 확인했다. 일회성 DB·서버·인증서를 정리했다.
- [운영 HUB migration](database-production.json): 복구 branch를 확보하고 migration 51→52 추가·재실행, 기존 중앙 계정·사이트·방 수 보존, 신규 신청 0을 확인했다. K-LOL/NEXUS DB는 접근하지 않았다.
- [실제 공급자·자식 사이트](provider-live.md): 별도 Neon·Vercel·private Blob을 생성하고 최종 source의 실제 배포·도메인 연결을 확인했다. 비공개 접근, 이미지 업로드·인증 읽기, 활성화 멱등성, 테마 게시, 기능 중지·복원과 자료 보존 10개 흐름이 통과했다. 검증 후 신규 시험 자원 4개를 정리하고 원격 404·로컬 DB 부재까지 확인했다. 운영 전용 Vercel 토큰을 통한 HUB worker 완주는 미검증이며, 실제 Neon 최초 초기화는 최종 ACTIVATING 제약 수정 전 0051이었다는 제한을 기록했다.
- 최종 전체 `npm run check`: lint·typecheck·ERD, 계약 796 + 단위 1,281 PASS·기존 SKIP1, 홈 이미지 검증과 운영용 빌드 통과. 최종 리뷰에서 팀 기능 중지 시 직접 계산 페이지 차단, 자식의 중복 브랜드/기능 설정 차단, 활성 모듈 메뉴 누락을 수정했다. 실제 공급자 검증에서 확인한 긴 주소 자동 축약은 환경 게시 전 정확한 도메인 등록과 실제 배포 대상 조회로 보완했다. 개설 기능 비활성 중 인증된 cron은 DB·공급자 호출 없이 `disabled`로 종료한다. 현재 트리와 전체 Git 이력 비밀정보 검사 통과.
- 기능 tag `community-site-studio-v0.1.0`는 위 운영 source를 가리킨다. `npm run release:evidence:check`에서 121개 기능 릴리스의 tag·commit·migration·문서 연결 검사가 통과했다.

## 아직 필요한 연결과 후속 범위

- [운영 환경 상태](environment-production.json): 전용 Neon 키·사이트별 키 생성용 비밀값·검증된 엔진 SHA를 HUB 전용 운영 환경에 보관했다. Vercel의 CLI 로그인은 서버 자동 개설 토큰으로 복사하지 않았다. 사용자 Vercel 로그인 후 전용 연결 권한을 설정하고 승인→작업 처리의 운영 연결을 확인해야 한다.
- [기존 사이트 보존](existing-sites-unchanged.json): K-LOL/NEXUS 운영 배포 ID는 이전과 같다. 기존 회원·경기 자료나 휴대폰을 새 방식으로 이관하지 않았다.
- 중앙·신규 사이트 SSO는 포함되지만, 기존 사이트의 본인 계정 연결과 가입 사이트 모아보기는 후속 단계다. 제휴·공유 모집·공동 대회·운영 기록 교환·휴대폰 동적 방 배포도 이 릴리스의 제공 기능이 아니다.

## 복구 경계

HUB 이전 검증 배포는 `community-hub-v0.1.0`, source `2bea3cbad7933bc508e871d34ec03aaa624c4315`다. 새 스키마는 추가 방식이며 기존 중앙 등록 자료를 삭제하지 않는다. 개설 작업은 오류 코드를 저장하고 중단하며 공급자 자원을 자동 삭제하지 않는다. 공개 완료된 자식의 운영은 중앙 장애에 직접 의존하지 않는다.

운영 migration 전 복구 branch는 `br-delicate-pine-a1fdrwkp`다. 복구는 HUB alias의 이전 검증 배포 전환과 필요 시 검증된 DB 복구 절차를 사용하며 삭제형 down migration을 실행하지 않는다. 새 가입·신청이 생긴 뒤에는 이전 배포가 해당 자료를 표시하지 못하는 점을 고려해야 한다.

인증값, 연결 URI, 원본 회원 정보는 검증 산출물에 포함하지 않는다. 테스트 DB와 브라우저 계정은 합성 자료다.
