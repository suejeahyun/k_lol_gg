# 카카오 내전 시간·공지 보존 v1.0.0

## 판정

- 기능 ID: `kakao-inhouse-round-metadata`
- 기능 버전: `1.0.0`
- 코드 커밋: `fa6d4f2875857ce7b1a3981f932738a42d35165b`
- Git tag: `kakao-inhouse-round-metadata-v1.0.0`
- Vercel 배포: `dpl_Fz2onEm7CAhypBDGYH9zVa1wLG9K`, `Ready`
- 불변 URL: `https://k-lol-a1lh8rd86-tjdmswo11-3715s-projects.vercel.app`
- 운영 alias: `https://k-lol-gg.vercel.app`
- 운영 health: `2026-09-12T04:47:34.417Z`에 HTTP 200, JSON `status: ready`
- DB migration: `0037_swift_brood`, SHA-256 `6c78ef2f688c6ae73774656966faee0c1e95b02b68ee03585c94b4ab89b1f109`
- 운영 DB 백업 분기: `pre-0037-inhouse-metadata-20260912` (`br-lingering-water-amlokf0n`), 2026-09-13 13:33 KST 자동 만료
- 휴대폰 코드: `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R7_2026_09_12`, 사용자 설치 대기
- 실제 Kakao 송수신: 사용자 확인 대기

서버 코드·DB migration·운영 배포와 health는 확인했다. 실제 MessengerBot R 교체와 Kakao 송수신은 휴대폰에서만 확인할 수 있으므로 실기기 E2E 완료로 판정하지 않는다.

## 증상과 원인

내전 양식의 `21:00`을 `20:00`으로 바꾸거나 일정 아래 자유 공지를 추가해도 참가자만 저장되고 `내전현황`은 `21:00`으로 되돌아갔다. V1 strict 휴대폰은 전체 양식을 서버에 보냈지만, 서버의 정규화 명령과 저장소에는 회차의 시간·공지·정원 메타데이터가 없었고 현황 출력이 `21:00`과 10명을 고정값으로 사용했다.

## 변경 내용

- 내전 회차별 종목·정원·시작 시각·공지·revision을 `competition.season_inhouse_rounds`에 저장한다.
- 전체 양식에서 `20:00`, KST 예약 시각, 일정 아래 자유 공지를 함께 파싱하고 같은 transaction에서 명단과 갱신한다.
- `내전현황`과 상세가 저장된 시간·공지·정원을 출력한다. 기존 메타데이터 없는 회차만 협곡·21:00·10명으로 fallback한다.
- 명단 없이 시간이나 공지만 바꿔도 `정보 업데이트`로 반영한다. 공지를 지운 전체 양식은 공지 삭제로 처리한다.
- 완전한 빈 1..10 양식도 서버에 전송해 참가자 전체 취소를 반영한다.
- 이름만, 부라인 공란, `ALL`, 대소문자·쉼표 포지션, 들여쓰기·번호 이스케이프를 허용하고 정상 행은 보존한다.
- 완성된 명단 뒤 번호형 공지는 참가자로 오인하지 않되, 정상 수정행과 명시적 빈 행은 V1의 마지막 입력 우선 동작을 유지한다.
- 종목 변경 때 기존 Kakao 신청·예비는 정리하고 SITE 신청은 보존한다. 확정자가 있으면 전체 변경을 409로 거절한다.
- 방·날짜·회차·종목 범위와 32바이트 해시, 공지 600자, 정원 2~20명 제약을 DB에서 강제한다.

## 검증 증거

- 전체 `npm run check`: 종료 코드 0
- 계약·단위 테스트: 725개 중 724 PASS, DB 전용 1개 intentional skip
- production build: 92 app pages PASS
- TypeScript, ERD drift, 여성 홈 가이드 아트 68/68, `git diff --check`: PASS
- ESLint: 오류 0, 기존·generated 경고 31개
- 휴대폰 V1 strict: 14/14 PASS
- 내전 parser/dispatcher 독립 재검수: 44/44 PASS
- 전체 `npm run test:db`: PASS
- 빈 DB migration 설치·재실행·백업 복원, 공지 삭제, metadata-only 갱신, 방·회차 격리, RESERVE 종목 전환, CONFIRMED 전환 거절: PASS
- 운영 Neon 사전 확인: head `0036`, 신규 테이블 없음, 종목 제약 RIFT 전용
- 운영 Neon 사후 확인: head timestamp `1789186759803`, migration hash 일치, 신규 테이블 존재, 행 0, 인덱스 3개, 두 source mode 제약에 `RIFT | ARAM | AUGMENT_ARAM`
- Vercel 운영 alias `/api/health`: HTTP 200, `status: ready`

## 실기기 확인 절차

1. MessengerBot R에 R7 전체 파일을 한 번에 교체하고 컴파일한다.
2. `봇버전`으로 `KLOL_KAKAO_BOT_V40_SITE_FIRST_NO_CODES_R7_2026_09_12`를 확인한다.
3. 봇이 출력한 내전 양식에서 시간을 `20:00`으로 바꾸고 공지와 참가자 한 명을 입력해 전체 양식을 다시 보낸다.
4. `내전현황`에서 같은 시간·공지·참가자가 모두 유지되는지 확인한다.
5. 참가자를 빈 행으로 되돌려 전체 양식을 보내고 취소가 반영되는지 확인한다.

배포 전에 보낸 기존 `20:00` 메시지의 원문은 서버에 저장되지 않았으므로, 그 양식은 배포 후 한 번 다시 보내야 한다.

## 남은 위험과 롤백

- V1 전체 스냅샷에는 revision 토큰이 없다. 여러 사용자가 오래된 같은 양식을 각각 수정하면 나중 제출이 먼저 제출한 명단·시간·공지를 되돌릴 수 있다. 이번 패치의 신규 회귀는 아니며, 해결하려면 화면은 유지하면서 숨은 기준 revision을 전달·검증하는 별도 설계가 필요하다.
- 설치 프로필 하나를 여러 실제 Kakao 방에서 동시에 켜면 같은 범위로 합쳐질 수 있다. FEATURES와 RECRUIT 각 프로필은 지정한 한 방에서만 활성화한다.
- 문제가 확인되면 Vercel을 직전 배포로 되돌리고, DB는 먼저 삭제하지 않는다. 필요할 때 자동 만료 전 백업 분기에서 복구한다.

## 디스코드 복붙 공지

```text
[K-LOL.GG 카카오 내전 시간·공지 보존 패치]

- 내전 양식에서 바꾼 시작 시간과 추가 공지가 이제 현황에도 그대로 유지됩니다.
- 참가자 추가·수정·빈칸 취소와 완전 빈 10칸 전체 취소를 반영합니다.
- 협곡·칼바람·증강 칼바람을 분리하고, 확정자가 있는 회차의 종목 오변경을 막았습니다.
- 기존 사용 방식과 양식 모양은 유지됩니다.

휴대폰 봇은 R7 전체 코드를 한 번 교체한 뒤 봇버전을 확인해 주세요.
배포 전에 보낸 수정 양식은 새 버전에서 한 번 다시 보내야 합니다.
```

## 다음 권장 패치

1. 기존 양식 모양을 유지하는 숨은 revision/base-token으로 오래된 복사본 충돌을 탐지한다.
2. 실기기 canary 결과와 익명 처리 시간 p50/p95를 운영 증거로 자동 기록한다.
3. FEATURES/RECRUIT 프로필이 지정하지 않은 방에서 동시에 활성화됐는지 진단 문구를 추가한다.
4. 공지 길이·줄 수 초과 때 잘린 결과 대신 사용자가 바로 고칠 수 있는 구체 안내를 제공한다.
