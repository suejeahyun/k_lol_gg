# 관리자 작업 완료 흐름 — 2026-10-07

시작 기준 `5c51fe51`, 작업 공간 clean 확인. AGENTS/PROJECT_RULES, S10 미디어 계약·현 구현, 10/06 실제 브라우저 미완료 기록을 대조했다. 이 담당은 공유 CUA·서버·운영 DB를 조작하지 않는다. 아래 입력은 root의 일회성 합성 fixture에만 사용한다.

## 실제 UI 조작 순서

| 과업 | 경로·필수 입력·조작 | 완료 증거 / fixture 조건 |
|---|---|---|
| 하이라이트 생성·수정·게시·보관 | `/admin/highlights/new` → 제목 `합성 QA 1007 하이라이트`, 설명 `합성 검증용`, 유효한 fixture YouTube URL, 정렬순서0 → 초안 만들기 → 상세에서 제목 수정·변경 저장 → 게시 → 공개 `/highlights/{id}` → 게시 내리기 또는 보관 → 목록 | URL의 생성 ID 유지, 새로고침 후 수정 내용, 게시 공개/보관 비공개 및 원본 보존. ADMIN+TOTP 세션. YouTube 실제 재생은 별도 외부 경계 |
| 갤러리 생성·업로드·게시 | `/admin/images/new` → 제목/설명 → root 제공 합성 PNG 2장(각12B 이상·4MiB 이하의 실제 유효 이미지) → 초안 만들고 등록 → 편집의 이미지2개·순서 확인 → 순서 바꾸기/삭제/READY 재연결 → 게시 → 공개 `/images/{id}` → 홈 표시/숨기기 → 보관 | 업로드 가능한 격리 저장소 필요. 확인된 업로드와 연결 수 구분, 공개 이미지/정렬, 보관 후 비공개. 선택 실패 파일만 재시도 |
| 미디어 목록 2페이지·필터 | `/admin/images?pageSize=1` 또는 `/admin/highlights?pageSize=1` → 다음→이전 → 게시 상태 필터→전체→적용 → 빈 조건에서 전체 보기 → `?page=0` 초기화 | 적어도2개 합성 초안이면 전체 페이지 흐름 재현 가능. 기존 UI에는 페이지 이동 누락/전체 필터 오류가 있어 아래 수정 대상 |
| 징계 생성·내용 수정·취소 | `/admin/discipline/new` → 합성 표시명/유형 주의/분류 일반/출처 `합성 QA`/사유 `격리 UI 검증` → 등록 → SUPER_ADMIN으로 사유·내부메모 변경→내용 저장→기록 취소 | 상세 revision·수정 사유·활성→종료 확인. 일반 ADMIN은 상세 읽기 가능, 수정·취소 불가. 임의 실회원 선택 금지 |
| 해소 과제 제출→검토 | 생성 시 **연결된 합성 계정/선수**를 대상 검색으로 선택하고 유형 경고 → 해당 계정 `/account/discipline`에서 이미지 제출 → 검토 대기 → SUPER_ADMIN `/admin/discipline/{recordId}`에서 메모·보완 요청/승인/취소 | 직접 표시명만 만든 경고는 과제가 생기지 않음. 일반 경고10장·내전 경고15장 필요. 전체 10장 수행 또는 일회성 fixture에서 9장 완료·1장 남은 상태 준비. 보완/승인/취소는 독립 합성 과제로 구분 |
| 이벤트전 생성·진행·취소복구 | `/admin/progress/event/new` → 제목, 방식, 모집 시작<마감, 대진 방식 → 생성 → 모집 시작 → 10명 추가 또는 기존 등록부에서 선택 가져오기 → 모집 마감 → 팀 자동 편성 → 대진 생성 → 점수·승리팀 저장 → 우승·완료 확정 | POSITION은 각 포지션2명, ARAM은10명 필요. 결과 입력용은 대진까지 준비된 별도 fixture 활용. 취소 사유 입력→취소→이전 단계로 복구는 완료 전 별도 이벤트에서 시행 |
| 멸망전 생성·일정·취소복구 | `/admin/progress/destruction/new` → 제목, CLASSIC, 4팀, 기존 예선 방식, 포지션별 모집8 → 생성 → 대회 일정 관리에서 한국시간 일정 저장 → 다음 작업 검토→확인·실행 → 대회 취소(사유2자 이상+확인 체크) → SUPER_ADMIN 복구 검토→확인·실행 | 생성/일정은 신규 합성 대회. 모집20명/주장4명/경매16명/대진·결과는 기존 단계별 합성 fixture를 활용하고 완료를 별도로 확인. 일정은 모집마감≤경매≤예선≤본선 순서 |

이 범위의 생성/미디어/징계/이벤트/멸망전 소스에는 `window.confirm`/`window.prompt`를 찾지 못했다. 멸망전의 단계 검토는 페이지 안 패널이며 취소 확인도 체크박스다. 10/06 도구를 막았던 참가 신청 취소 native confirm은 이 범위와 별개이며, 해당 탭의 확인창이 남아 있다면 새 조작 결과를 제품 실패로 혼동하지 않는다.

## 확인된 UI 연결 문제와 처리

- **미디어 목록(P2)**: repository는 page/pageSize/status와 서버가 보정한 currentPage를 반환하지만 화면에는 이전/다음이 없다. 21번째 이후 콘텐츠를 기본 목록에서 찾을 길이 없다. native GET의 `status=`도 strict parser가 거절하여 ‘전체’ 적용이 조회 오류로 끝난다.
- 기존 query parser를 유지하고 UI에서 단일 빈 status만 전체로 정규화한다. 배열·unknown·잘못된 값은 계속 거절한다. 기존 `.pagination` 스타일을 재사용하고 현재 필터/페이지 크기를 링크에 보존한다. 잘못된 주소 초기화·조회 실패 재시도·빈 필터 전체 보기 추가. CSS/DB/API 변경 없음.
- [실제 SSR 수정 전](admin-media-pagination-before.log) 하이라이트/갤러리 10개 FAIL → 수정 후 해당10개 PASS. 이후 공개 보기/표시2개를 추가했고 [추가 전](admin-media-public-link-before.log) 신규2개 FAIL→[추가 후](admin-media-pagination-after.log) 총12개 PASS. 실제 parser·실제 페이지 렌더를 사용한다. root 브라우저 조작은 별도 기록한다.
- 상태 표시는 같은 파일의 공통 매핑으로 `초안·게시됨·보관됨`, revision은 `변경 버전`으로 정리했다. `게시됨`인 편집 화면에만 기존 `/highlights/{id}` 또는 `/images/{id}`로 가는 `공개 화면 보기` 링크를 제공하며 초안/보관 콘텐츠에는 표시하지 않는다. 보관 복구 버튼도 `초안 복구`로 일치시켰다.
- 독립 검토의 미적용 필터/다음 링크 상태 후보를 반영해 form key를 적용된 page/status/pageSize로 구성했다. 새 쿼리에서 제어되지 않는 select를 다시 초기화하므로 화면의 선택값을 현재 목록과 동기화한다. [추가 전](admin-media-filter-remount-before.log) 조건2개 FAIL→최종 focused에서 총14개 SSR/렌더 조건 PASS. 실제 선택→다음의 브라우저 조작은 root 확인 범위다.
- 미디어 조회 API의 기존 page≤100, pageSize≤50 제한은 변경하지 않는다. 생성 링크는 허용 page를 넘지 않는다. 이번 재현은 첫 페이지 이후 접근과 기존 범위 안 탐색이며 무제한 목록 지원으로 확대하지 않는다.

## 추가 교차검토

- 최초 감사에서 이벤트 서버의 `REPLACE_SETTINGS`에 대응하는 상세 설정 수정 폼이 없어 root에 기능 공백으로 전달했다. 이후 별도 담당자가 기존 명령을 연결했고 [설정 수정 근거](event-settings.md)에 범위를 기록했다. 이 담당의 독립 검토는 PLANNED·참가자 기록0 조건, ID/revision에 따른 입력 초기화, KST 왕복, 실패 복구를 대조한다. 지난 HTTP 성공이나 handler 검사를 오늘 실제 UI 완료로 세지 않는다.
- 과제 raw upload는 stage→finalize→SUBMIT_EVIDENCE이며 같은 SHA 자산 중복과 stale revision을 서버에서 거절한다. 응답 유실에 raw bytes를 자동 재전송해서는 안 된다. 서버에 남은 READY 저장본을 기존 `제출 이어하기` 경로로 연결하는 복구를 확인했다.
- 10/06 생성 handler·DB/HTTP 통과를 오늘의 브라우저 생성·수정·과제 검토 완료로 대체하지 않는다. 실제 확인 전에는 위 항목은 실행 순서이며 통과표가 아니다.

## 과제 업로드 복구 수정과 근거

- `owner-discipline-tasks.tsx`의 파일 해시 및 성공 응답 JSON 파싱이 예외 경계 밖이라 실패 시 busy 해제/refresh가 실행되지 않았다. READY 저장본 제출은 JSON 확인 없이 HTTP 성공만으로 진행했고 재시도마다 키가 달라졌다.
- raw 파일 처리를 try/catch/finally로 감싸 실패 뒤 입력 잠금과 최신 상태 갱신을 복구했다. 확인된 응답의 taskId와 증가한 정수 revision으로만 배치를 이어간다. 파일 입력은 비워 같은 파일을 다시 선택할 수 있다. raw bytes를 자동 재전송하지 않는다.
- READY 제출은 기존 `ClientMutationKeyStore`를 사용해 같은 asset/기대 revision/본문에 같은 키를 유지한다. 네트워크·잘린 응답·인증 실패에서는 키를 보존하고 확정 거절/확인 성공 후에만 완료한다. 즉시 ref guard로 동시 제출을 막고 갱신 중에는 다른 과제 입력도 기다린다. 진행 상태를 실제 busy/refreshing 동안만 표시한다.
- 최초 테스트의 key-store 의존성 연결 누락은 [하니스 오류](discipline-owner-harness-initial.log)다. 이를 제품 결함으로 세지 않았다. 의존성을 바로잡은 동일 하니스가 `git show 5c51fe51:.../owner-discipline-tasks.tsx`의 원본을 `.tmp`에서 실행해 [6개 실제 실패](discipline-owner-before.log)를 확인했다. 현재 [실행 후](discipline-owner-after.log) **6 PASS**다.
- 재현 범위: 파일 읽기 실패 복구, 업로드 후 연결 JSON 유실→새로 받은 READY 저장본으로 JSON 제출(추가 raw 업로드 없음), 네트워크/401 후 같은 키 재시도, 잘린 JSON 성공의 오류 표시, 동시 클릭1요청, 부분 배치의 revision 증가와 불명확 응답 이후 중단. DB·실제 저장소를 사용하는 검사로 과장하지 않는다.

## 최종 담당 검사

- [focused 계약/실제 handler](admin-followup-focused.log) **56 PASS**: 미디어 목록14, 과제6, 기존 징계 UI6, 생성 회귀30.
- [관련 unit](admin-followup-unit.log) **14 PASS**: 미디어 query/input, 업로드 계획/제한, 징계 application.
- [ESLint](admin-followup-eslint.log) exit0, [TypeScript](admin-followup-typecheck.log) exit0. CSS는 변경하지 않았다.
- 제품 소유 변경: `admin-media-pages.tsx`, 미디어 폼의 복구 버튼 문구1곳, `owner-discipline-tasks.tsx`. API·DB·권한 정책·실회원 데이터 미변경. 전체 check·build·실제 UI 확인·운영 배포는 root 통합 절차로 남긴다.
