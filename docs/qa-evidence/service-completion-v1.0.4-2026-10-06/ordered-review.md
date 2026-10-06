# 전체 분석 후 순서별 확인 — 1.0.4

## 이번 요청과 범위

사용자 추가 요구: 화면의 부가 설명 전부 삭제, 모든 기능을 먼저 분석한 뒤 정렬된 항목을 하나씩 확인, 기존 요구 모두 적용. 분석 기준 source는 `f4ab0647`이며 사용자 작업 공간의 기존 변경은 없었다. 별도 기존 checkout은 수정하지 않는다.

화면의 정적 소개·사용법 반복·장식 문구·구현 설명은 삭제한다. 입력 이름·단위/허용 범위, 현재 상태·오류·저장 결과·복구 동작, 권한·삭제 영향, 실제 게시 콘텐츠, 개인정보/정책 본문과 숫자를 해석하는 기준은 기능의 일부로 구분한다. 필요한 기준은 가능한 한 직접적인 label로 줄인다. `display:none`으로 가리거나 모든 p/description을 기계적으로 지우지 않는다. 삭제 범위 질문에 별도 답변이 없으면 이 기준을 적용한다.

## 전체 기능 분석 원장

[현재 소스 인벤토리](interface-inventory.json)를 실제 page/route와 재대조했다. 108개 페이지·212개 API·63개 호환 handler·3개 metadata, 총 386경로에 누락/삭제 차이가 없다. API·배경 작업도 각 기능군에 연결하며 UI 문구 수정으로 인증·집계·transaction·예약 설정을 바꾸지 않는다. 기존 원장의 조작 위치·method·계약 근거는 [전체 기능 원장](../2026-10-05-service-completion/feature-inventory.md)을 참조한다. 옛 통과 결과를 이번 실행 결과로 복사하지 않는다.

전 기능의 수정 전 분석을 [핵심 8페이지](core-analysis.md), [계정·공개 기능](public-copy-audit.md), [관리자·API·작업](admin-audit.md)으로 나누어 완료한 뒤 소유 파일을 분리해 수정했다. 아래는 그 결과를 01–18 순서로 대조한 **소스 분석·개별 수정 검증 단계**의 원장이다. ‘실행’은 로그에 기록된 컴포넌트/핸들러·도메인 실행을 뜻하며, 운영 쓰기·전체 HTTP E2E·실기기 통과와 동의어가 아니다. 같은 테스트가 여러 기능에 걸쳐 있어 행별 수를 합산하지 않는다.

| 순서 | 기능군 | 분석·수정 결과와 근거 | 이번 개별 검증 결과 | 별도 확인·필요 조건 |
|---:|---|---|---|---|
| 01 | 홈·탐색 | [핵심 결과](core-after.md)·[공통 결과](shared-after.md): 반복 소개·장식·카드 설명 제거. 홈 6영역, 생성 이미지/배경, 하나의 랭킹 슬라이드와 직접 선택, 메뉴·검색·로그인 필요 상태 보존 | [core-focused](core-focused.log): 메뉴 query 선택·랭킹 선택/키보드/재생·빈 슬라이드 제어. [core-contracts](core-contracts.log): 공개 피드 정렬/제한·일일 챔피언. [독립 검토](independent-review.md)에서 순서·테마·색인/키보드 보존 확인 | 최적화 빌드의 실제 배치·포커스·좁은 화면은 root 브라우저 확인 단계. 실 스크린리더·신규 이용자 연구는 별도 조건 |
| 02 | 계정·인증 | [공개 결과](public-copy-after.md)·[관리 결과](admin-after.md): 소개 카드 제거·폼 단일 열. 동의·신규 승인/기존 연결 검토·권한·safe next·비밀번호 결과·임시 비밀번호 1회 표시 유지. 관리자 오류 재요청 교정 | [public 계약/실행](public-copy-contract-tests.log): 본인 편집 경계·미확정 재시도·연결 경고. [public 도메인](public-copy-domain-tests.log): 동의 payload·비밀번호/세션·만료/변조/역할. [재시도](recovery-after.log): 실제 Next 새 요청. [공통·관리 교차 검토](core-cross-review.md): 필수 입력/복구 유지 | 실제 사용자 계정이나 비밀번호는 조작하지 않음. 새 버전의 브라우저 로그인·세션 복귀와 통합 인증/DB 실행은 root 단계. 운영진의 복구 요청 확인·비밀번호 전달은 실제 운영 업무 |
| 03 | 내전 참가 | [핵심 결과](core-after.md): 참가 신청 제목·정원/예비/마감/공개 항목 간결화, 카카오 회원 연결 문의 링크 유지. 오류의 전송 여부 단정 삭제, `retry` 연결·중복 main 교정 | [core-focused](core-focused.log): 회차/날짜/시즌 폼 identity·ARAM 무포지션·연결 문의·명단 표시 실행/계약. [application-landmark-after](application-landmark-after.log): 공개 본문 하나와 실제 서버 재요청 확인. [독립 검토](independent-review.md): 계정/정원/상태 guard 유지 | 이번 focused 결과를 DB 신청·취소 전 과정 재실행으로 표시하지 않음. 새 빌드의 실제 조작은 root 격리 검증 단계. 카카오 명단 반영·동명 연결은 해당 운영 방/회원 확인 필요 |
| 04 | 파티 모집 | [핵심 결과](core-after.md): 파티 모집/현재 모집 명칭, 실제 정원·명단·내용 유지. 버튼을 ‘카카오 명단 조회 명령 복사’로 변경하고 복사 완료≠참가 완료 명시 | [core-focused](core-focused.log): 공개 카드/API DTO 노출 계약·대회와 모집 경로. [독립 검토](independent-review.md): 최신 전체 명단 편집·봇 저장 확인·문의/도움말 단계 유지 | 시스템 클립보드 실제 쓰기, 외부 방 전송·봇 저장·휴대폰 수신은 소스 검사만으로 통과 처리하지 않음. 사용자 기기·허용된 카카오 방 필요 |
| 05 | 이벤트전 | [핵심 결과](core-after.md)·[관리 결과](admin-after.md): 목록/상세 소개 제거, 이벤트전 명칭·실제 설명/우승/MVP 유지. 포지션 표시는 한국어·전송 코드는 유지. [독립 검토](independent-review.md)의 빈 결과 조사 오류 수정 확인 | [core-focused](core-focused.log): 실제 option/checkbox 코드 보존·공개/관리 API 경계 계약. [core-contracts](core-contracts.log): 신청/취소/재신청·원자적 가져오기·10명/팀 구성·대진 수정·챔피언/MVP·revision/멱등 도메인 실행 | 합성 도메인 실행과 실제 DB 저장을 구분. 새 화면 전 과정 및 모바일 조작은 root 검증 단계. 실제 대회 참가자/결과는 테스트하지 않음 |
| 06 | 멸망전 | [핵심 결과](core-after.md)·[관리 결과](admin-after.md): 단계/경매 반복 설명 제거. 점수·0/미수집·최소 금액·고정 조건, 오류/오프라인/재시도 유지. 완료·취소 투표 종료 표기 | [core-contracts](core-contracts.log): 모집 인원·라인/무포지션·경매 예산·대진·순위·공개 투표 projection·자기보고 점수/일정. [core-focused](core-focused.log)·[admin-focused](admin-focused.log): 소유자/관리자 lifecycle와 경계 계약. [교차 검토](core-cross-review.md): 교체/MVP 작업 영향 유지 | 실제 동시 접속·장시간 polling·현장 경매/투표는 이번 합성 검증과 별개. root 격리 화면 검증 및 실제 진행 권한이 필요 |
| 07 | 실력별 팀 만들기 | [공개 결과](public-copy-after.md)·[관리 결과](admin-after.md): ‘실력·포지션으로 팀 나누기’, 단계 교습 제거. 10명·포지션·출처·중립점수·단일 추천·수동 변경/평가/저장 유지 | [public 계약/실행](public-copy-contract-tests.log): 검색 취소/최신 요청·응답 유실 시 같은 요청/키 재시도·수정 입력 새 키·초안 revision 분리 실행. [public 도메인](public-copy-domain-tests.log): 5:5 전체 보존·포지션·결정성·동일 점수 커널·잘못된 입력. [독립 검토](independent-review.md): 실제 control 보존 | 기존 회귀로 미확정 응답 처리 확인. 이번 단계에서 실제 DB 동시 쓰기를 추가 실행했다고 주장하지 않음. root의 격리 조작/통합 검사와 구분; 운영 초안은 변경하지 않음 |
| 08 | 무작위 팀·진영 | [공개 결과](public-copy-after.md): 랜덤·티어별 팀 나누기/코인 던지기 명칭, 구현/사용법 설명 제거. 10명·동명 슬롯·1–10 티어·결과·복사·초기화·모션 감소 유지 | [public 도메인](public-copy-domain-tests.log): 입력 수/중복 표시·편향 방지·5:5 분할·최소 차이·코인 상태 전이. [public 계약/실행](public-copy-contract-tests.log): 화면 입력/빈값/오류/결과·제작 영상/fallback 계약. 삭제한 hint의 aria 참조 정리 | 실제 클립보드·영상 재생·모바일 키보드/모션 감소의 최종 화면은 root 브라우저 단계. 도메인 난수 검증을 실기기 확인으로 표시하지 않음 |
| 09 | 경기 기록·제출 | [공개 결과](public-copy-after.md): 경기 결과 명칭·소개 제거, 회차 의미를 필드명으로 이동. 접수 코드·승인/비밀번호 복구·이미지 제약/열람 범위·검토/거절/취소 후 행동 유지. [관리 결과](admin-after.md): OCR 후보 검토·공개 조건 유지 | [public 계약/실행](public-copy-contract-tests.log): 이어하기 로그인 복귀·문맥 identity·계정 제한·조회 실패/없음 구분·생성 후 route 잠금·취소된 미완료 이미지 단계. [admin-focused](admin-focused.log): 가져오기/충돌·무효화/거절 dialog·명시적 행 확인. [독립 검토](independent-review.md): owner/code/payload 유지 | 새 버전의 생성→이미지→수정→취소/공개 E2E는 root 격리 환경에서 별도 판정. 실제 Blob/OCR 제공자·운영 승인과 외부 파일 수명은 합성/소스 검증만으로 완료하지 않음 |
| 10 | 플레이어 | [공개 결과](public-copy-after.md)·[관리 결과](admin-after.md): 목록/프로필 소개 제거, 검색·필터·정렬·통계·관리 편집 입력 유지. 회원명 검색과 공개 결과의 차이 보존. 관리자 오류 재조회 교정 | [public 계약/실행](public-copy-contract-tests.log): 중복 q 정규화·안전한 portrait·공개 Riot 상태·서버 차트/한국 시각. [admin-unit](admin-unit.log): 쓰기 DTO/정규화·쿼리/ID·fingerprint. [admin-focused](admin-focused.log): picker/권한·역할 진입. [교차 검토](core-cross-review.md): aria 도움말/비활성 복구 유지 | 실제 회원명·프로필을 테스트 목적으로 변경하지 않음. 긴 실제 데이터의 시각 확인은 root 단계; live Riot 수집은 15번 조건과 동일 |
| 11 | 랭킹·MMR | [공개 결과](public-copy-after.md)·[관리 결과](admin-after.md): 소개 제거·MMR 순위 명칭. 회차/최소 표본/동률/집계 시각, 이전 공식·재계산 대기·최고 관리자 전환 조건 유지 | [core-focused](core-focused.log): 필터 query와 입력 identity. [public 계약/실행](public-copy-contract-tests.log): MMR 실제 페이지 렌더·페이지/검색·포지션 표본·오류/범위 밖 복구. [public 도메인](public-copy-domain-tests.log): 정확한 비율 동률·상세/홈 동일 정렬. [admin-mmr-ui](admin-mmr-ui.log)·[admin-unit](admin-unit.log): 역할/공식 전환 조건 | 운영 MMR 전체 재계산은 실행하지 않음. 최고 관리자 판단/권한과 전환 전후 수치 검토가 필요하며 문구 정리 배포로 공식 전환을 완료했다고 표시하지 않음 |
| 12 | 커뮤니티 미디어 | [공개 결과](public-copy-after.md)·[관리 결과](admin-after.md): 목록 소개/장식 제거, 저장된 제목·설명 유지. 이미지 한도/순서/부분 성공·편집 상태·비공개 자산 삭제 대기 유지 | [public 계약/실행](public-copy-contract-tests.log): 이미지 오류 fallback·수동 캐러셀·단일/빈 사진·44px/모션 계약. [public 도메인](public-copy-domain-tests.log): YouTube CSP. [admin-unit](admin-unit.log): 유효 파일만 5장 제한·남은 용량·보고 길이. [교차 검토](core-cross-review.md): 업로드 도움말 ID·게시/삭제 조건 | 실제 YouTube 응답·휴대폰 재생·외부 Blob 업로드/읽기/삭제는 별도 제공자/기기 확인. 새 게시/삭제를 운영 데이터로 시험하지 않음 |
| 13 | 징계·과제 | [공개 결과](public-copy-after.md)·[관리 결과](admin-after.md): 반복 업로드 안내·저장 구현 설명 제거. 실제 사유/과제/검토 내용·익명 집계·10/15게임/검토 기준·증빙 열람 범위 유지 | [admin-focused](admin-focused.log): 공개 집계만 노출·본인/관리 revision/멱등·최고 관리자 쓰기·서명된 정리 작업 계약. [public 계약/실행](public-copy-contract-tests.log): 내 계정의 과제/증거 진입 연결. [교차 검토](core-cross-review.md): 대상 선택/사유 입력 유지 | 이번 개별 검사에서 증거 파일 전체 저장·정리 worker를 새로 실행하지 않음. 격리 HTTP/DB 실행은 root 단계, 실 저장소 검증은 별도 연결 조건 |
| 14 | 문의·운영 신청 | [공개 결과](public-copy-after.md)·[관리 결과](admin-after.md): 중복 입력법 제거. 비공개 범위·답변 수단/수동 처리·접수번호·민감정보 금지·동의/180일 보존·입력/키 재시도 유지. 기존 접수 내용은 보존 | 이번 변경은 소스/표시 검토 중심. [독립 검토](independent-review.md): 동의·연락 경로·비공개/정책 의미 확인. 관리자 양식 페이지별 검토는 [admin-after](admin-after.md)에 기록. 이 행을 새 문의 저장 E2E 통과로 세지 않음 | 새 접수/재시도·보존 정리의 통합 격리 실행은 별도 결과 필요. 실제 운영팀 답변 전달·연락처 수신은 본인/운영자 확인 조건 |
| 15 | Riot 연결 | [공개 결과](public-copy-after.md)·[관리 결과](admin-after.md): 버튼 반복/구현 설명 제거. 공개 전적과 본인 인증 차이·연결 해제·동기화 실패·부분/미수집·대기·전체 대상 범위 유지 | [public 도메인](public-copy-domain-tests.log): 합성 제공자 analytics·429/backoff·타임라인 실패·cursor 복구·누락≠0·저장 리포트 필터. [admin-focused](admin-focused.log): 실제 서버 렌더 목록 페이지/대상 범위. [독립 검토](independent-review.md): 표본/분모/소유권 경계 유지 | live Riot 응답·전적 API 권한·RSO 앱/리디렉션 승인·사용자 본인 계정 동의 필요. 설정 준비나 과거 probe 성공을 현재 연결·본인 인증 통과로 바꾸지 않음 |
| 16 | 카카오 연동 | [핵심 결과](core-after.md)·[관리 결과](admin-after.md): 명령 조회/실제 참가 구분, 운영 방/양식 상태, 최근 인증/전송 확인 의미 유지. 서명/nonce·poll/ack·예약 작업은 변경 없음 | [core-focused](core-focused.log): pending 조회 ADMIN/변경 SUPER TOTP·revision-safe 명령·공개 개인정보 projection 소스 계약. [admin-unit](admin-unit.log): 일 마감 KST 경계·대기 임계값·과거 성공/미확인 판정. [독립 검토](independent-review.md): 실제 저장 확인 절차 보존 | 이번 focused 검증은 실제 봇/폰을 호출하지 않음. 서명된 HTTP 통합은 root 결과와 분리하며 카카오 설치 기기·봇 권한·대상 방·실수신/ack 확인 필요 |
| 17 | 운영·백그라운드 | [관리 결과](admin-after.md)·[공통 결과](shared-after.md): 기술/반복 소개 제거, 운영 진단 관측 범위·임계값·권한·감사/사용량 의미 유지. [독립 검토](independent-review.md): API/도메인/DB/배포 설정 변경 없음 | [admin-focused](admin-focused.log): 관리자 route 원장·서버 렌더 진단의 무 polling/무 mutation·권한 경계. [admin-unit](admin-unit.log): 진단 판정·KST 마감·usage 개인정보/분모·서명 쿠키. [교차 검토](core-cross-review.md): 운영 기록과 현재 연결 상태 구분 | 전체 check는 아래 통합 표의 최종 통과 근거 연결. 격리 DB/HTTP·Vercel 배포/READY·운영 smoke·복구 버전은 진행 중. 실제 cron 호출/작업자·Blob·Riot·카카오 상태는 로그와 제공자 조건 필요; 빈 대기열 호출 미기록은 미확인 유지 |
| 18 | 도움말·정책·설치 | [공개 결과](public-copy-after.md)·[공통 결과](shared-after.md): 소개/장식만 제거, 실제 도움말 답변·정책 본문/버전·설치 경로·복구 버튼 유지. 설치 거절/중복 prompt/초기 offer 덮기/완료 후 늦은 응답의 4문제 교정 | [public 계약/실행](public-copy-contract-tests.log): 실제 설치 handler/effect 4회귀 통과, 시작/도움말 계약. [application-landmark-after](application-landmark-after.log): root/public/admin 404 구성·권한·재시도. [독립 검토](independent-review.md)·[교차 검토](core-cross-review.md): 정책/aria/복구 유지 | 실제 iOS Safari·Android Chrome·데스크톱 설치 허용/메뉴와 appinstalled 수명주기는 해당 기기/브라우저 필요. 합성 이벤트를 실기기 설치 완료로 표시하지 않음 |

각 행은 해당 담당자가 실행한 로그와 변경 범위를 연결한 것이다. [핵심 결과](core-after.md), [공개 결과](public-copy-after.md), [관리 결과](admin-after.md), [공통 결과](shared-after.md)의 개별 검증이 완료되었고, 다른 담당의 [공개·공통 독립 검토](independent-review.md)와 [공통·관리 독립 검토](core-cross-review.md)에서 새 릴리스 차단 결함을 발견하지 않았다. 외부 의존성 또는 이번 실행 근거가 없는 쓰기 시나리오는 위 마지막 열에 남겼다.

## 통합 단계 상태 — 개별 검증과 분리

이 원장 갱신 중 root의 최종 필수 check 종료 결과가 추가되어 아래에 연결했다. 나머지는 진행 상태를 유지한다. 담당별 focused 통과나 과거 릴리스 증거가 현재 버전의 실제 브라우저·배포 확인을 대신하지 않는다.

| 단계 | 현재 상태 | 완료 판정에 필요한 별도 근거 |
|---|---|---|
| 전체 필수 check | **완료 — `npm run check` exit 0 (root 실행)** | [check.log](check.log): 계약 488 PASS, 단위 1,047 PASS·조건부 skip 1, lint 오류 0·기존 경고 58, typecheck·ERD·생성 이미지 검사·build 통과. skip을 PASS로 세지 않음. 초기 옛 문구 기대 실패/정정은 [shared-after](shared-after.md)에 구분 기록 |
| 격리 HTTP/DB·실제 브라우저 | root 진행 중 | 최적화 빌드의 실제 화면/조작·계정/권한별 흐름·쓰기/실패 복구 실행 기록. 소스 또는 합성 컴포넌트 검사와 분리 |
| 배포·운영 확인 | 진행 중, 이 원장에서 미완료 | 확정 커밋/버전·배포 READY·운영 URL·변경 화면과 핵심 과업 사후 확인·복구 기준 |
| 실기기·외부 연동 | 조건부 미확인 | 위 기능별 기기/계정/외부 승인/권한/수신 증거. 신규 비용·계정 소유권·불가역 운영 변경은 별도 결정 |

## 기존 요구사항 적용표

| 요구 | 이번 적용·완료 근거 |
|---|---|
| 현재 상태와 사용자 변경 보존 | AGENTS·PROJECT_RULES·이전 계약/릴리스 읽기, clean 기준 SHA 및 별도 checkout 보존 |
| 목적성·초심자 직관성 | 설명 없이 구분되는 제목/버튼/입력/상태를 각 순서의 source/실행 회귀에서 확인; 최종 화면·실제 신규 이용자 연구는 별도 |
| 전체 기능/모든 상태 | 18기능군 모두 분석·개별 변경/검증 근거 연결. 정상·빈값·오류·권한·재시도·취소는 실행 수준을 구분하고 긴 내용·기기/접근성·외부 지연의 미확인 조건을 행별로 명시 |
| 원인 수정 | 잘못된 label·부가 문구를 실제 JSX에서 정리; 테스트 숫자나 CSS 숨김으로 대체하지 않음 |
| 디자인 유지 | 홈 6영역 순서·단일 랭킹·생성 이미지/배경 보존을 source/회귀로 확인. 삭제 후 실제 여백·대비·조작 크기 확인은 root 브라우저 단계 |
| 필요성 있는 기술/기능 | 새 프레임워크/공급자·중복 기능을 추가하지 않음; 이전 보안 patch 유지, 성능 수치 과장 없음 |
| 안전한 검증 | 운영 데이터 쓰기 시험 없음. 필수 check와 개별 권한/입력/상태 회귀 통과; 실제 화면·격리 HTTP/DB는 진행 중으로 분리 |
| 배포/운영 | 최종 source/tag/check·Vercel READY·운영 주소·독립 재검토·복구 기준을 후속 production 근거에 기록 |
| 완료 기준과 미확인 분리 | 최고관리자 MMR 전환·실기기 카카오/RSO·스크린리더/신규 사용자 연구를 완료로 바꾸지 않음 |
| 진행/최종 보고 | 순서별 새 발견·결과와 검증 한계를 함께 기록 |

## 공통 화면 분석·수정 결과

SiteShell의 브랜드 부제와 footer 홍보 문장, 기능 검색 결과의 중복 설명/키보드 사용법, 전체 메뉴 사용 설명을 삭제했다. 링크 이름·검색 label·로그인 상태·정책 링크·Riot 고지·보이지 않는 접근성 이름은 보존했다. 공통 로딩/404의 제목 반복 문장은 없애고 상태 제목·로딩 표시·복구 버튼을 유지했다. AI 도우미의 반복 환영/부제는 제거하고 실제 질문/응답·오류·개인정보 안내는 유지했다. 계정/관리자 공통 컴포넌트도 담당별 결과에 연결했다. 삭제된 설명을 가리키는 접근성 참조·불필요한 빈 노드가 남지 않는지 [공통·관리 교차 검토](core-cross-review.md)와 [공개·공통 독립 검토](independent-review.md)에서 다시 확인했다.

## 최종 로컬 통합 확인

마지막 소스까지 필수 check exit 0, 새 격리 DB 전체 계약과 복원·종료 정리, 108페이지/169조건 HTTP를 통과했다. 실제 과업과 마지막 후속 화면은 [브라우저 기록](browser.md), [최종 HTTP](release-http.json), [최종 DB](database-release.log)에 연결한다. 각 행의 실기기/외부 권한 경계는 그대로이며 대표 화면 확인을 모든 조작의 실행으로 확대하지 않는다. 배포와 운영 확인은 후속 production.md에서 확정한다.
