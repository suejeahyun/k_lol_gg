# 서비스 이용 흐름 개선 1.0.2 운영 검증

- source/tag: `0410c1b56c2f62c5da0cc992d081c8d4cfb56991` / `service-completion-v1.0.2`
- main Vercel: `dpl_8mrTSkSRqj3kmxwJN41sNUSUnR6K`, READY
- immutable: https://k-lol-pkbh3zamm-tjdmswo11-3715s-projects.vercel.app
- 운영: https://k-lol-gg.vercel.app
- migration: `0047_usage_analytics`, 운영 스키마·회원·신청·경기 변경 없음

접수 코드와 내부 멱등성 scope의 형식 충돌로 수정·업로드·취소가 실패하는 P1을 수정했다. 잘못된 관리자 변경 주소는 구조화된 400으로 복구하고, 취소한 참가 신청은 ‘다시 참가 신청’으로 안내한다. 상세 원인과 범위는 [점검 기록](README.md)을 따른다.

## 검증과 배포

[필수 check](check.log)는 계약 463개·단위 1,047개 PASS, 조건부 skip 1개, lint 오류 0개·기존 경고 58개이며 타입·ERD·이미지 명세·production build를 통과했다. 전체 Git 기록과 현재 추적 파일 비밀정보 검사도 통과했다. 읽기 전용 MMR 도구의 최종 ESLint와 전체 TypeScript 검사도 별도로 통과했다.

[격리 실제 HTTP](../2026-10-06-owner-task-http/README.md)는 접수 생성→수정→중복/정상 업로드→취소, 팀 생성→동시 저장→revision 복구, 관리자 반려→재개→승인→공개 전환과 권한·중복·폐기 세션 경계를 검증했다. [실제 브라우저](browser.md)는 생성·수정·파일 선택·중복 오류 후 정상 파일 재선택·검토 대기까지 확인했다. 네이티브 취소 확인창의 도구 응답 제한은 미확인으로 분리했다. 격리 클러스터는 종료·정리했다.

clean source에서 CLI 후보 `dpl_GmPDVhfYGUWak4LGCsmnUSiMhtue`를 만들었다. Vercel 인증을 통한 앱 익명 GET으로 health ready·홈·관리자 API 401을 확인한 뒤 승격했다. [업로드 제외 확인](deployment-input.json)에서 `.git`, 환경 비밀, `.private`, `.tmp`, 빌드 산출물이 배포 입력에서 제외됨을 확인했다.

승격한 후보의 [서비스 HTTP 31개](production-service-http.json)와 [기본 HTTP 14개·생성 이미지 11개 MIME/SHA-256](production-http-base.json)이 통과했다. branch/tag/main을 push한 뒤 동일 source의 위 Git main 배포가 READY가 되고 운영 alias를 가진 것을 확인했다. [별도 배포 후 점검](post-deploy-independent.md)은 source metadata와 공개 경계 확인을 남긴다. HTTP 시간은 단발 관측이며 성능 개선 수치나 Web Vitals로 사용하지 않는다.

## 배포 후 추가 발견과 후속 조치

잘못된 `/matches/submit?code=invalid`를 실제 브라우저에서 다시 열었을 때 404 문구와 복구 링크가 표시되지만 **공개 메뉴·본문·푸터가 중첩되는 P2**를 발견했다. root not-found와 공개 layout이 각각 SiteShell을 렌더링하는 공통 원인이다. streaming의 HTTP 200 자체는 오류 판정 근거가 아니다. 이 결함을 숨기지 않고 다음 patch에서 공통 오류 경계를 수정·검증·배포한다. 따라서 1.0.2 이후 새로운 방해 요소가 없다는 완료 판정을 하지 않는다.

## 운영 미완결 조건

실제 [Blob/Riot·자동 작업](../service-followup-2026-10-06/external-runtime.md)을 확인했다. MMR은 구 공식 generation 1과 미소비 변경 이벤트 13건이 남는다. [읽기 전용 영향 분석](../service-followup-2026-10-06/mmr-transition-review.md)과 격리 전환·동시성·이전 generation 보존 검증을 완료했지만, 운영 전환은 실제 SUPER_ADMIN의 ADMIN 로그인 후 실행해야 한다. 로그인 요청은 전달했으며 현재 세션은 로그인 화면이다. DB 접속 자격으로 이 권한을 대신하지 않는다.

실제 휴대폰 카카오 수신·백그라운드, RSO 승인 client와 소유자 동의, iOS/Android/스크린리더, 외부 경보 수신과 제공자 PITR은 필요한 외부 조건을 위 문서에 구분했다. [전환 전 논리 백업·격리 복원](../service-followup-2026-10-06/mmr-before-transition-backup-final.json)은 192개 테이블의 행 수·논리 컬럼·922개 제약과 migration/MMR 상태, UTC 정규화한 MMR 9개 테이블의 전체 행 내용 대조를 통과했다. 운영은 읽기 전용으로 접근했고 로컬 클러스터를 정지했다. 비공개 archive를 보존했으며 이 결과를 제공자 PITR·Blob 본문 복구 확인으로 확대하지 않는다.

코드 복구 기준은 `dpl_9WgTqPhaqq3bCBLp2QbftPk4ZceC` (source `1ee5bd56`)다. 핵심 조회 장애·새 5xx·수정 흐름 회귀 시 기존 배포 재승격과 health/공개 조회를 확인한다. 이후 MMR 데이터 전환을 수행하면 코드 복귀가 점수 복구를 대신하지 않으며 검증된 forward-fix 또는 DB 복구 범위 결정이 필요하다.
