# 사이트·카카오 봇 재점검 — 2026-10-14 KST

현재 코드에서 개선이 필요한 결함 9건을 확인했다. 모두 P2로 분류하되, 다른 모집을 선택하거나 유효한 양식을 잃게 하는 1~3번과 운영 차단을 무시하는 4번을 먼저 수정하는 것이 좋다. 제품 코드 수정·운영 설정 변경·배포는 이번 점검에서 수행하지 않았다.

- 소스 기준: `7494cac5930755ed342605f398d725b49c74bdbd` (문서 포함), runtime source `4d6a4aa30171774876c4f4af2b031301d23656a0`.
- 운영 확인: canonical `https://k-lol-gg.vercel.app` → `dpl_HzWW4ADSsWBc7zATWfgi6WBaHxj5`, READY·runtime source 일치.
- 봇 기준: R28 공개 생성본. 실기기 R28 설치·실제 카카오 발송은 이번 점검에서 확인하지 않았다.
- 방법: 운영 공개 화면 읽기, 서버·클라이언트 호출 흐름, 실제 함수·TSX·R28 artifact의 합성 VM 실행. 가짜 transaction/가짜 fetch를 사용했으며 운영 명단·계정·설정은 시험 변경하지 않았다.
- 전체 화면·모든 API를 전수 재실행한 결과는 아니다. 기존 전체 검사 PASS와 별개로, 경계 조건·오류 복구·사이트와 봇의 연결을 집중 재검토했다.

| 순서 | 확인한 문제 | 필요한 개선 |
| --- | --- | --- |
| 1 | 사이트의 서로 다른 모집 카드가 같은 숫자 명령으로 연결됨 | 공개 카드·복사 명령까지 고정 모집코드 연결 |
| 2 | 06시를 넘긴 신청 화면이 다음 날 회차로 신청·취소 요청 | 화면의 시즌·운영일·모집 식별자를 요청에 고정 |
| 3 | 빠른 휴대폰 시계가 유효한 양식 원본을 조기 만료 처리 | 업무 시각은 서버 기준으로 통일 |
| 4 | 관리자 전체 중지·유지보수 설정이 V4 경로에 적용되지 않음 | 중앙 gateway에서 운영 설정 검증 |
| 5 | 답장 실패/오류 안내가 이후 정상 답장을 억제 | 처리 결과·답장 전달 성공·오류 안내 구분 |
| 6 | 파티 `예비추가`가 본 참가로 처리됨 | 예비 의도 보존 또는 명시적인 미지원 안내 |
| 7 | 경기 접수 수정 충돌 후 같은 revision으로 재실패 | 최신값 조회·입력 보존·충돌 비교와 재시도 |
| 8 | 설정 저장 중 추가로 입력한 값이 사라짐 | 저장 중 입력 잠금 또는 이후 변경분 보존 |
| 9 | 일부 내전 마감 별칭은 서버가 지원해도 휴대폰에서 무응답 | 휴대폰·서버의 정규화·별칭 계약 통일 |

1. **P2 — 사이트 카드의 숫자 명령이 다른 날짜의 모집을 조회한다.**

   운영 `/recruits` 화면에서 서로 다른 파티 두 개가 모두 `#2`로 표시되고, 카드의 카카오 안내가 `구인상세 2`인 것을 직접 확인했다. 실명·참가자 원문은 증거 파일로 보관하지 않았다. 공개 목록은 모든 날짜의 IN_PROGRESS를 허용하지만, DTO는 날짜·고정코드를 제공하지 않고 카드는 번호만 전달한다. 봇의 숫자 명령은 현재 운영일을 사용하므로 이전 날짜의 카드에서도 오늘의 같은 번호를 찾는다. 운영의 두 파티가 어느 날짜·scope에 속하는지는 이번 점검에서 DB로 조회하지 않았으며, 날짜가 다른 정상 상태에서의 잘못된 대상 선택은 합성 함수 실행으로 확인했다.

   근거: [카드 명령 생성](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/components/navigation/recruit-instructions.tsx:9), [목록 조회](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/infrastructure/postgres-recruiting-adapter.ts:648), [번호 해석](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/kakao-v4/canonical-command.ts:582).

   고정코드를 사이트 DTO·카드·복사 명령까지 연결하고, 아직 코드가 없는 기존 모집의 전환 경로도 정의해야 한다. 실제 방/scope가 다르면 코드 조회도 실패할 수 있으므로 카드가 안내하는 카카오 대상과 연결 상태를 함께 검증해야 한다.

2. **P2 — 오전 6시를 넘긴 신청/취소가 화면과 다른 날짜를 대상으로 한다.**

   신청은 recruitNo·라인·예비 여부만, 취소는 recruitNo만 전송한다. 서버는 요청 시각으로 운영일과 현재 시즌을 다시 선택한다. 05:59:59에 본 폼에서 06:00:01에 제출하는 실제 서비스 합성 실행은 화면 날짜 10월 13일과 repository 대상 10월 14일이 달랐다. 다음 날 같은 회차가 있으면 새 신청이 잘못 생성될 수 있다. 취소는 다음 날 신청 revision까지 같은 경우 다른 날 신청을 취소할 수 있다. 다른 사용자의 신청을 변경하는 문제는 아니다.

   근거: [신청](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/app/(public)/(applications)/applications/application-actions.tsx:107), [취소](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/app/(public)/(applications)/applications/application-actions.tsx:124), [서버 날짜 결정](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/seasons/application/season-service.ts:346).

   요청에 표시 당시의 시즌·운영일 또는 모집 UUID를 묶고, 현재 유효 대상과 달라지면 입력을 보존한 채 새로 확인하도록 해야 한다. revision만으로는 모집 대상 자체의 변경을 막을 수 없다.

3. **P2 — 휴대폰 시계 편차가 원본 발급·삭제 시각에 영향을 준다.**

   서버 05:56, 휴대폰 06:00(+240초)은 허용된 서명 편차 ±300초 안에 든다. dispatcher가 이 휴대폰 시각을 상세 조회의 now로 넘겨 다음 운영일의 양식을 발급하고, 아직 4분 유효한 기존 원본을 만료 삭제 조건에 넣는다. 삭제는 scope 제한 없이 최대 256건이다. 저장 경로는 서버 시각을 쓰므로 새로 받은 다음 운영일 원본도 실제 06시까지 원본 조회가 실패할 수 있다. 실제 DB에서 삭제를 실행한 것이 아니라 실제 issuer와 가짜 transaction으로 생성된 SQL 조건·발급 버전을 검증했다.

   근거: [휴대폰 시각 전달](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/kakao-v4/dispatcher.ts:694), [운영일 결정](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/kakao-assistant/postgres-kakao-assistant.ts:832), [삭제 조건](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/infrastructure/kakao-form-snapshots.ts:152).

   클라이언트 timestamp는 서명 신선도 검증에 사용하고, 조회·발급·만료·변경 대상의 운영일은 한 번 잡은 서버 시각으로 결정해야 한다.

4. **P2 — 관리자 전체 중지·유지보수 토글이 V4 요청을 막지 못한다.**

   관리자 화면은 전체 Kakao 연동·유지보수·모집 기능 설정을 저장한다. legacy gateway는 `isRuntimeKakaoFeatureEnabled`를 호출하지만 실제 R28의 V4 route→service→dispatcher 경로는 이 설정을 읽지 않는다. ADR의 승인된 installation scope 예외는 물리 방/발신자 등록부에 관한 것으로, 이 운영 토글을 무시하도록 승인한 결정은 확인되지 않았다.

   실제 route를 VM으로 실행하고 실제 서명·분류·서비스를 사용한 합성 검증에서 `globalEnabled=false`, `maintenanceMode=true`, `recruitingEnabled=false` 조건의 legacy gate는 false였다. V4는 설정 조회 0회, HTTP 200, PARTY CREATE dispatch 1회였다. 저장소와 dispatcher의 최종 저장은 가짜 구현이며 실제 모집을 생성하지 않았다.

   근거: [운영 설정 gate](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/kakao-admin/runtime.ts:11), [V4 실행](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/app/api/integrations/kakao/v4/commands/route.ts:110), [관리자 토글](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/app/(admin)/admin/kakao/kakao-settings-form.tsx:8).

   중앙 V4 경로에서 전체 중지·유지보수·명령별 기능 설정을 확인해야 한다. 점검 중 허용할 상태 조회와 이미 완료된 요청의 재전달 정책도 함께 정해야 한다.

5. **P2 — 실패한 답장을 전송 완료로 기록해 정상 결과가 숨겨진다.**

   `replier.reply()`가 false여도 `markReplySent()`를 호출한다. 실제 R28 생성본 VM에서 동일 log 재처리는 HTTP 2회·답장 시도 1회·수신 성공 0회였다. 첫 요청 timeout으로 오류 안내를 보낸 뒤 같은 log를 다시 처리해 서버가 성공을 돌려줘도 성공 답장을 숨기는 경우도 확인됐다. 정상 전달을 한 번으로 제한하는 동작 자체가 문제가 아니라, 실패/오류 안내가 최종 결과와 같은 완료 상태를 점유한다는 점이 문제다.

   근거: [답장 래퍼](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/scripts/build-messengerbot-v1-strict.mjs:276), [완료 상태](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/integrations/messengerbot-r/v1-strict/KLOL_KAKAO_BOT_V1_STRICT_TRANSPORT.js:213).

   서버 처리와 답장 전달 상태를 분리하고, false 반환을 성공으로 기록하지 않아야 한다. 일시적 오류 안내가 나중의 최종 응답을 차단하지 않도록 이벤트별 결과 상태를 구분해야 한다. 무조건 자동 재시도하도록 바꾸는 제안은 아니다.

6. **P2 — 파티의 예비 추가 의도가 사라진다.**

   `상세 7 예비추가 합성`, 고정코드형, `대기추가`가 정상 전송되지만 classifier/canonical 경로가 reserve를 버린다. 실제 도메인 함수 합성 실행에서 빈 본 참가 자리가 있는 파티의 결과가 `slotNo:2, substitute:false`였다.

   근거: [분류](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/kakao-v4/classifier.ts:299), [변경 요청](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/kakao-v4/dispatcher.ts:854), [명단 변경](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/domain/recruiting.ts:284).

   예비 의도를 저장까지 전달하거나, 지원하지 않는 유형에서는 명확하게 거부하고 예비칸 작성법을 안내해야 한다. 명령을 받아 일반 참가로 조용히 바꾸면 안 된다.

7. **P2 — 경기 결과 접수 수정이 충돌 후 같은 revision으로 계속 실패한다.**

   두 탭에서 같은 접수를 열고 한 탭이 먼저 수정/업로드하면 다른 탭의 저장은 412가 될 수 있다. 현재 폼은 일반 오류만 표시하고 새 revision을 읽지 않는다. 최신 props를 받아도 최초 useState 값은 유지된다. 실제 TSX 합성 실행에서 부모 revision 2가 전달된 뒤에도 두 PATCH가 모두 `If-Match: "1"`, refresh 0회였다.

   근거: [충돌 처리](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/app/(public)/(matches)/matches/submit/submission-form.tsx:237), [초기 상태](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/app/(public)/(matches)/matches/submit/submission-form.tsx:55).

   기존 신청 폼의 충돌 비교 방식을 재사용하여 입력 보존·최신값 조회·차이 확인 후 재시도를 제공해야 한다.

8. **P2 — 관리자 설정 저장 중 입력한 값이 성공 응답에 덮인다.**

   사이트 설정과 카카오 설정 모두 저장 중에도 입력을 허용하고, 성공하면 응답 전체로 settings state를 교체한다. 지연된 사이트 설정 응답을 재현해, 요청 이후 추가 입력이 요청 당시 값으로 돌아가는 것을 확인했다. 카카오 설정도 동일한 호출 구조다.

   근거: [사이트 설정](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/app/(admin)/admin/site-settings/settings-form.tsx:39), [카카오 설정](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/app/(admin)/admin/kakao/kakao-settings-form.tsx:23).

   저장 중 입력을 잠그거나, 전송 이후의 변경을 따로 보존해 성공 응답과 합쳐야 한다. 단순 저장 버튼 비활성화만으로는 해결되지 않는다.

9. **P2 — 휴대폰의 내전 마감 별칭이 서버 계약과 다르다.**

   `내전 7쫑`, `내전 7마감`, `내전 7종료`, `내전 #7ㅉ`, `／내전 ７ㅉ`는 실제 서버 classifier에서 INHOUSE_FINISH지만 R28 VM에서는 HTTP 0회·무응답이었다. 기본 `내전 7ㅉ`가 동작하는 것과는 구분된다.

   근거: [휴대폰 사전 분기](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/scripts/build-messengerbot-v1-strict.mjs:294), [서버 명령 분류](E:/k-LOL.GG/worktrees/full-audit-fixes-20261013/src/modules/recruiting/kakao-v4/classifier.ts:407).

   실제 휴대폰 생성본과 서버가 같은 별칭·공백·전각 문자 표를 통과하도록 계약 검사를 묶어야 한다.

추가 기능 제안은 결함과 구분한다. 첫째, 관리자에게 실제 봇 버전·마지막 요청·지원 명령 버전을 보여주면 서버 배포와 휴대폰 교체 여부를 구분할 수 있다. 현재 V4 envelope에는 봇 코드 버전이 없고 관리자 보안 점검은 legacy 환경변수를 읽는다. 둘째, timeout 안내는 무조건 재전송을 권하기보다 저장 여부를 상세 조회로 확인하도록 통일하고, 생성 응답을 잃어 코드조차 모를 때 최근 요청/초안을 찾는 복구 경로를 제공하면 좋다.

재현 파일은 로컬 `.tmp/reaudit-v4-maintenance.ts`, `.tmp/audit-recruit-boundary-probe.ts`, `.tmp/site-review-20261014/client-probe.mjs`, `.tmp/site-review-20261014/boundary-probe.ts`, `.tmp/kakao-reaudit-20261014.mjs`에 있다. TypeScript 및 Kakao probe는 `node --import tsx`, client probe는 `node`로 저장소 루트에서 실행했다. Kakao probe는 정상 성공 중복 억제 control도 함께 통과했고 [상세 결과](kakao-synthetic-results.json)를 보존했다. 핵심 결과는 [합성 검증 요약](observations.json)에 보관한다. 실제 운영 데이터 쓰기·실기기 송수신·전체 회귀 검사를 수행한 것으로 해석하지 않는다.
