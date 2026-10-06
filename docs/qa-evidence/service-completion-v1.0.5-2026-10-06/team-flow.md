# 팀 만들기 → 수동 변경 → 저장·경기 연결 재감사

2026-10-06. 기준 HEAD `ca242292`, 운영 runtime `583dab4d`(1.0.4). 시작 시 작업 트리는 clean이었다. AGENTS/PROJECT_RULES, S03 신청 ADR, S04 경기 provenance ADR, 공개/관리 기능 원장, 팀 draft service·DTO·HTTP 경계와 설치된 Next의 Client Component/Link 문서를 읽었다. 새 UI 설명이나 계산 정책을 추가하지 않는다.

## 발견·원인·수정

| 중요도 | 발견과 재현 | 원인 | 반영 |
| --- | --- | --- | --- |
| P2 | 수동 슬롯을 바꾼 뒤 평가하지 않아도 기존 선택 팀 저장·복사·경기 접수 가능. root는 1.0.4 격리 브라우저에서 Saved 초안의 블루 1번/레드 6번을 교체한 뒤 화면 첫 선수는 6번, 복사 결과는 1번인 것을 실제 확인했다. | `manualLayout`과 서버 `selectedCandidate`는 분리되어 있는데 후속 버튼은 두 값의 차이를 검사하지 않았다. 저장 API는 빈 body로 서버 선택 배치를 저장한다. | 실제 선수/팀/포지션 조합 차이를 비교. 편집됐을 때만 `수동 변경 · 평가 필요` 상태와 되돌리기를 표시하고, 평가 전 저장·복사·경기 접수·통계 재평가를 막는다. 평가 성공 후 서버 선택 배치가 돌아오면 동일 배치의 저장·복사·경기 연결 가능. |
| P2 | 수동 평가 응답/refresh 대기 중 또는 ARCHIVED 초안에서도 키보드/drag로 배치를 바꿀 수 있었다. | 저장 버튼만 busy/archive를 확인하고 카드 교체는 확인하지 않았다. | 카드 버튼·draggable와 실제 handler를 함께 잠근다. 응답과 새 서버 상태 사이에도 기존 transition 잠금 유지. 오류 시 편집 배치는 보존하고 동일 revision/body/key로 재시도 가능. |
| P2 | 추천 화면 재로그인 복귀 인자에서 tab/team 및 목록의 선택 draft가 사라졌다. 공개·관리 페이지의 실제 async JSX 실행으로 확인. | 승인/관리 인증 helper에 pathname만 전달했다. | 기존 allowlist parser 결과만 복귀 주소로 직렬화. 추천 tab·BLUE/RED·선택 draft 및 목록 page/pageSize 보존. 중복/미허용 query는 복귀 주소로 복사하지 않는다. |
| P2 | `?page=2&pageSize=24` 목록에서 다음 페이지가 기본 12개 크기로 바뀌어 목록 구간이 달라진다. | `pageHref`가 page만 생성했다. | 공개·관리 목록 양쪽의 이전/다음 링크가 적용된 pageSize를 유지한다. 기본 12개 주소는 기존 형태 유지. |

권한·API·DB·멱등성·계산식·MVP·운영 데이터는 변경하지 않았다. 제품 수정은 공통 draft workspace와 공개/관리 draft 목록·상세 4페이지, 총 5개 파일이다. shared CSS와 builder는 수정하지 않았다.

## 순서별 확인 결과

| 단계 | 확인한 실제 구현과 개별 검증 | 검증 수준/남은 조건 |
| --- | --- | --- |
| 참가 신청 가져오기 | 후보 API는 승인 계정 경계, 현재 활성 시즌·최근 날짜·활성 플레이어·APPLIED/CONFIRMED만 조회. 예비·취소는 제외한다. 사이트/카카오 출처·회차를 선택하고 10명 초과 시 앞 10명과 실제 인원 메시지를 사용한다. 칼바람 무포지션 입력은 신청 저장 시 ALL로 정규화되어 builder 전체 자동 배치로 전달된다. | repository/route/컴포넌트 소스 확인 및 기존 계약 검사. 이 담당은 새 DB/HTTP 서버를 실행하지 않았다. 카카오 실기기 수신은 별도 조건. |
| 검색·10명·포지션 | 선택 수·중복 방지·10명 제한·주/부/자동 값·초기화 유지. 지연 검색의 취소와 최신 요청 로딩 회귀 통과. | 실제 handler/effect 및 도메인 실행. 새 최적화 브라우저에서 10명 추가·키보드/모바일 입력은 root 담당. |
| 추천 생성 | 생성 응답 유실 시 같은 payload의 같은 멱등 키 재시도, 입력 변경 시 별도 키, 성공 후 이동 전 잠금 유지. | 실제 client handler와 실제 key store 실행. DB transaction/승인 계정 TOCTOU 재검증은 root 통합 격리 검사. |
| 수동 변경·평가 | OWNER/ADMIN × EVALUATED/SAVED 모두 편집 상태를 판별. 이전 팀의 저장/복사/접수 차단, 되돌리기, 평가 요청에 실제 교체 선수 전송, 실패 보존, 응답/refresh 잠금, ARCHIVED 잠금 확인. | 실제 workspace handler + 지연 응답 실행. root의 1.0.4 실제 재현이 별도 존재하며 최종 빌드 CUA 재확인은 아직 진행 전. |
| 저장·재열기 | 선택 변경/평가 회차에 따른 기존 remount와 같은 문맥 refresh의 로컬 편집 보존 계약 유지. dirty 해제 후 복사 결과가 새 서버 선택 선수이며 OWNER/ADMIN 결과 목적지를 각각 확인. | 실제 component 실행 + source 계약. 저장된 DB 재조회/새 브라우저 열기는 root의 격리 E2E로 확인해야 한다. |
| 밴픽/목록/로그인 복귀 | 실제 4페이지에서 인증 helper에 넘기는 tab/team/draft/page/pageSize 및 다음 페이지 링크를 실행 검증. raw extra key와 중복 team은 복귀 주소에 남지 않는다. | page JSX/입력 parser 실행. 관리자 로그인은 상위 AdminLayout도 적용되므로 이 인자 검증만으로 전체 HTTP redirect를 완료 처리하지 않는다. |
| 경기 결과 연결 | 편집 중엔 이전 선택 roster로 이동 불가. 평가된 상태에만 본인 `/matches/submit?teamBalanceDraftId=…`, 관리자 `/admin/matches/new?teamBalanceDraftId=…` 진입. 실제 결과 페이지 owner·selected·ARCHIVED guard와 정확한 10명 2팀 provenance 도메인 회귀 유지. | client 목적지 실행·결과 접근 source 계약·순수 provenance 실행. 이미지 저장→운영 검토→공개는 이 담당의 실행 범위가 아니다. |

## 재현과 검사

- [team-flow-before.log](team-flow-before.log): 기존 생성/멱등 3 PASS, 새 편집·busy·archive 회귀 **3 FAIL**. 실제 원본 handler가 잘못된 동작을 허용했다.
- [team-flow-after.log](team-flow-after.log): 위 6개 모두 PASS.
- [team-return-before.log](team-return-before.log): 공개/관리 상세·목록 복귀 **4 FAIL**. [team-return-intermediate.log](team-return-intermediate.log)는 복귀 수정 후 관리자 페이지 크기 전달이 남아 3 PASS/1 FAIL인 중간 결과다.
- [team-flow-focused-after.log](team-flow-focused-after.log): 팀·결과 접수·검색·관리 경계 관련 **32 PASS**.
- [team-flow-final-focused.log](team-flow-final-focused.log): 마지막 검증에서 OWNER/ADMIN × EVALUATED/SAVED와 미허용 복귀 query까지 보강한 관련 **14 PASS**. 앞 검사와 중복되므로 합산하지 않는다.
- [team-flow-domain.log](team-flow-domain.log): 균형 계산·5:5/포지션 보존·결정성·잘못된 입력·추천·query·경기 provenance **18 PASS**.
- focused ESLint: 5개 제품 파일과 변경된 3개 테스트 모두 exit 0. `npx tsc --noEmit --incremental false`: exit 0.

초기 관련 검사 27개 중 1개는 `mode === "ADMIN"` 문자열 이후에 특정 링크 문구가 나와야 한다는 기존 source 순서 기대가 실패했다([team-flow-focused.log](team-flow-focused.log)). 동작은 OWNER/ADMIN 공통 분기로 옮겼으며 실제 복구 후 href가 각 역할의 올바른 경기 경로인지 handler 테스트로 강화했다. 역할/보관/복구/경기 provenance 검사를 삭제하거나 완화하지 않았다.

## 수정하지 않은 항목과 미확인

다른 draftId 이동 시 key에 id가 없다는 소스만 보고 상태 잔류 후보로 처음 보고했으나, Next 동적 segment가 하위 페이지를 교체하는 경계도 있어 실제 결함으로 확정할 근거가 부족했다. 해당 key는 변경하지 않고 결함 집계에서도 제외했다. 기존 평가 회차/선택 signature key는 유지한다.

전체 build/check, DB 서버, 브라우저 자동화, commit/deploy를 이 담당은 실행하지 않았다. 운영 회원·신청·초안·경기 데이터도 변경하지 않았다. 최종 브라우저의 실제 포커스·disabled 스타일·수동 배치 저장/재열기, 상위 인증 경계 포함 HTTP, 실제 외부 API/저장소, 배포 성공과 운영 확인은 root 결과가 필요하다.

root UI 확인 순서: 10명 추천 생성 → 카드 교체 → 이전 팀 저장/복사/접수 비활성 및 dirty 상태 → 되돌리기 또는 수동 평가 → 새 팀 저장/복사/결과 접수 → 목록 재열기. 관리자 ARCHIVED 카드 잠금과 BLUE 밴픽 query의 로그인 복귀, pageSize=24 다음 페이지도 함께 확인한다.
