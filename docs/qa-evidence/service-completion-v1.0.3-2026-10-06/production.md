# 첫 방문 직관성·화면 완성도 1.0.3 운영 반영

- source: `824502a20065c4d2d84d3676e9db47028ca6c913`
- tag: `service-completion-v1.0.3`
- Vercel main: `dpl_B9ZsVWWauhziZf4veFaKo68TpB1B`, READY
- immutable: https://k-lol-fblz7crdr-tjdmswo11-3715s-projects.vercel.app
- 운영: https://k-lol-gg.vercel.app
- migration: `0047_usage_analytics`, 이 배포의 스키마·운영 데이터 변경 없음

## 목적성 판단과 발견 사항

참가·모집 → 팀 편성 → 경기 제출·검토 → 전적·공유의 기본 기능군은 구현돼 있다. 문제는 기능 수보다 발견 가능성, 현재 상태, 실패 후 복귀와 일부 실제 저장 경로였다. [전체 기능 원장](../2026-10-05-service-completion/feature-inventory.md)은 386개 경로·499개 method와 실제 메뉴/조작을 포함한다. [기능군별 최신 결과와 한계](README.md)는 이전 감사·후속 수정의 근거를 연결한다. 원장의 모든 버튼×오류×기기 조합을 실제 실행했다고 주장하지 않는다.

이전 patch에서 P1인 접수 수정·업로드·취소의 대소문자 scope 충돌과 동시 수정·재시도 문제를 해결했다. 이번에는 배포 후 발견된 P2 공개 404 중복 틀, 종류가 드러나지 않는 랭킹 선택, 새 제출과 이어하기의 우선순위, 신청 종류와 현재 메뉴 불일치, 검색 취소 후 남는 로딩 상태를 고쳤다. 신청 포지션의 영문 표시는 P3 문구 불일치로 수정했다. [문제·원인·수정 목록](README.md), [한국어 변경 공지](../../patch-notes/2026-10-06-service-completion-1.0.3.md).

홈 여섯 영역의 순서와 생성 이미지 테마를 유지했다. 랭킹 한 슬라이드에서 승률·최다 참여·최다 MVP를 이름으로 선택하도록 하고, 제출은 경기 정보 → 결과 이미지 → 접수 상태의 실제 진행을 표시한다. 선택 입력은 접고 필수 입력·다음 행동·복구 경로는 드러낸다. touch 크기·여백·대비·포커스·긴 코드 줄바꿈을 기존 컴포넌트로 정리했다. 신기술 명목의 새 공급자·중복 기능·새 인증·검증 없는 캐시를 추가하지 않았다.

Next.js와 ESLint 설정을 16.3.8로 맞추고 범위가 제한된 하위 보안 패치를 적용했다. runtime audit은 12건 → 0건, 전체 audit은 18건 → 12건으로 남는다. 잔여 개발 의존성 경고는 미해결 braces와 구 esbuild의 두 원인에 대한 전파 항목이며, 새 산출물의 runtime trace에 해당 12개 패키지가 없음을 확인했다. 강제 하향이나 호환되지 않는 override로 숫자만 지우지 않았다. [보안 판단과 공식 출처](security-dependencies.md).

## 실제 검증 범위

- [필수 check](check.log): 계약 476 PASS, 단위 1,047 PASS·조건부 skip 1, lint 오류 0·기존 경고 58. 타입·ERD·생성 이미지 명세·Next 16.3.8 production build 통과. 이전 Git 기록 전체 비밀정보 검사에 이어 새 소스와 최종 문서 트리 검사도 통과했다. 릴리스 원장 86개·tag 86개와 migration 근거 검사 및 최종 diff 검사 PASS.
- [최종 격리 DB](database-final.log): fresh/upgrade·migration·복원, 도메인과 권한·중복·동시 수정 계약을 모두 통과한 뒤 optimized browser fixture를 유지했다. 합성 계정으로 실제 브라우저 결과 생성 → 접힌 선택 정보 저장 → 이미지 2장 등록 → 검토 대기까지 완료했다. fixture 종료는 exit 0, 클러스터 정지·일회성 작업 경로 정리 확인.
- [실제 브라우저](browser.md): 제출 복구·키보드·320/390px 입력, root/public/admin 404 다섯 경계, 운영 홈 320/390/768/1280px와 랭킹 직접 조작을 확인했다. 실제 기기·스크린리더·신규 사용자 연구와 구분한다.
- [운영 HTTP 31개](production-service-http.json): 홈 순서, 로그인 복귀, 공개 조회·권한, MMR 페이지와 공통 랭킹 순서 PASS. [14개 기본 조회·11개 이미지](production-http-base.json)는 health·MIME·SHA-256을 확인했다. 시간은 단발 관측이며 Web Vitals나 성능 향상 수치가 아니다.
- [독립 소스 재검토](independent-final-review.md)는 실제 컴포넌트 22개 회귀와 CSS/권한/상태 교차 검토에서 추가 중대 결함을 발견하지 않았다. [독립 운영 재검토](post-deploy-independent.md)에서 최종 배포 metadata·health·공개 오류 경계와 랭킹을 따로 대조했다. HTTP streaming의 404 digest와 hydration 후 DOM을 혼동하지 않았다.

## 배포와 복구

clean source로 만든 CLI 후보 `dpl_DVr4h9NXK5RMaMGZEaPgMARBfgWr`는 Vercel 인증을 통한 익명 앱 GET에서 홈 200·health ready·관리자 API 401을 확인한 뒤 운영 승격했다. source/tag/branch/main을 push하고, 동일 SHA의 위 main 배포가 READY이며 canonical alias를 가진 것을 다시 확인했다. [최종 배포 요약](production-deployment.json)은 provider 응답의 비밀값 없는 필드와 마지막 health 결과만 기록한다.

코드 복구 대상은 1.0.2 `dpl_8mrTSkSRqj3kmxwJN41sNUSUnR6K` / source `0410c1b5`다. 새 5xx·핵심 조회/제출 장애·권한 회귀가 나타나면 기존 배포를 재승격한 후 health와 변경 경로를 다시 확인한다. 현재 확인에서 이 기준에 해당하는 운영 회귀는 발견하지 않았다. 문서 후속 commit은 배포 입력 ignore 규칙으로 건너뛰며 실행 source tag를 이동하지 않는다.

## 완료와 분리한 미확인·미실행

1. **MMR 운영 전환:** 구 공식 generation 1과 13개 미소비 변경 이벤트가 남는다. 읽기 전용 영향 분석과 격리 전환·동시성 검증, 운영 논리 백업을 실제 격리 DB에 복원하는 검사까지 통과했다. 운영 실행은 실제 SUPER_ADMIN의 ADMIN 세션이 필요하며 현재 열린 화면은 로그인 대기다. DB 자격으로 관리자 권한을 위조하지 않는다. [영향과 실행·복구 조건](../service-followup-2026-10-06/mmr-transition-review.md), [백업/복원 실제 결과](../service-followup-2026-10-06/mmr-before-transition-backup-final.json). 코드를 되돌려도 이후 데이터 전환을 되돌리는 것은 아니다.
2. **외부 실동작:** Riot status와 갱신·Blob 왕복·일일 마감/보존 작업은 실제 관측했다. 카카오 휴대폰 설치·수신/백그라운드, RSO 승인 client와 소유자 동의, Riot PARTIAL 개별 원인, 실제 외부 경보 수신은 별도 조건이 남는다. [외부 운영 근거](../service-followup-2026-10-06/external-runtime.md).
3. **체험과 복구의 한계:** 실물 iOS/Android·스크린리더·초심자 사용성 조사·OS 모션 감소 설정 전환, 실제 OCR 공급자 정확도, 최대 부하, 제공자 PITR·Blob 전체 본문·키 복구는 미확인이다. 네이티브 취소 확인창은 브라우저 도구 제한이 있었고 HTTP 취소 검증과 분리했다.

추가 수정이 필요 없다고 판단한 범위는 이번에 바꾼 입력·복구·메뉴·랭킹·오류 경계의 검증된 동작이다. 별도 재검토에서도 해당 범위의 새 중대 오류나 명확한 과업 방해 요소를 찾지 못했다. 기본 과업을 위해 새 기능을 더 늘릴 근거도 발견하지 못했다. 이 판단을 ‘모든 화면의 최고 품질 보장’이나 위 미완결 항목의 완료로 확대하지 않는다.
