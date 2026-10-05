# 외부 연동·자동 작업 실제 운영 확인

확인 시각: 2026-10-06 08:40~08:45 KST. 작업 HEAD는 `bae10999`, 조사한 production은 `dpl_9WgTqPhaqq3bCBLp2QbftPk4ZceC` / source `1ee5bd568cbb608cf7fd9bc8a845ea8dc6a27321`, 운영 주소는 https://k-lol-gg.vercel.app 이다. 이 문서는 후속 점검 시점의 사실이며 과거 릴리스의 미확인 상태를 현재 상태로 재사용하지 않는다.

## 실행 범위와 보호

- 기존 [운영 준비 런북](../../operations/OPERATIONAL_READINESS_RUNBOOK.md)의 `scripts/operations/probe-storage.ts`로 서명된 단일 진단을 수행했다. 서버가 생성한 UUID의 `readiness/storage/<UUID>` 새 1px PNG 하나만 다뤘고, 같은 객체를 삭제한 뒤 부재를 확인했다.
- 기존 [Riot 활성화 런북](../../operations/RIOT_ACTIVATION_RUNBOOK.md)에 따라 운영의 서명된 `riot-api-probe`를 한 번 호출했다. 서버의 고정 KR status-v4 조회이며 회원·PUUID·임의 URL을 전달하지 않았다.
- 두 진단의 nonce와 maintenance 기록 외에 기존 계정·회원·신청·경기·자산 행을 수정하지 않았다. 기존 자산 읽기, 실제 알림 발송, 카카오 등록·poll·ack·재전송, Riot 계정 연결·강제 동기화, cron 수동 실행, 환경 변경이나 신규 키 발급은 수행하지 않았다.
- DB 조회는 `REPEATABLE READ READ ONLY`, 연결 7초·statement 10초 제한으로 수행했다. 로컬에 있던 DB 자격의 운영 바인딩은 **방금 인증된 운영 Blob probe의 정확한 runId가 같은 DB의 성공 기록에 존재함**으로 확인했다. 호스트 추정이나 과거 파일명만으로 운영 DB라고 판정하지 않았다.
- 비밀은 기존 비공개 파일에서 프로세스로만 읽었다. 제공자의 sensitive 환경 값은 API에서 생략되므로 그 경계를 우회하지 않았다. 공개 증거에는 값·회원명/ID·방/설치 식별자·원본 공급자 응답·원본 요청 로그가 없다.

## 실제 결과

| 대상 | 실행·관측 | 판정과 한계 |
| --- | --- | --- |
| 비공개 Blob 저장소 | 08:40:48 KST 운영 HTTP 200, `VERCEL_BLOB_PRIVATE`, 업로드·해시검사·삭제·삭제확인 모두 1. maintenance `SUCCEEDED`도 일치 | 실제 provider 왕복 PASS. 사용자 이미지 제출의 모든 UI/권한 시나리오를 대신하지 않음. [응답](storage-probe-result.json), [DB 대조](operational-readonly-result.json) |
| Riot 고정 API 진단 | 08:42:10 KST 운영 HTTP 200/provider 200, `STATUS_ENDPOINT_ACCEPTED`. maintenance `SUCCEEDED` 일치 | 현재 운영 key의 status-v4 수락 PASS. production key 등급·모든 API 권한·RSO 승인은 증명하지 않음. [응답](riot-probe-result.json) |
| Riot 실제 자동 요약 | 운영 flag=true, fake runtime=false, DB feature=true. CONNECTED 104건. 요약 120건, 최신 티어/최근솔로 갱신 08:40:48 KST | 실제 데이터 갱신 관측. 합성 adapter만 통과한 상태와 구분. 신규 소유자 연결/동의 E2E는 미실행. [설정](external-config-summary.json), [집계](operational-readonly-result.json) |
| Riot 부분 성공 | 보관된 job은 SUCCEEDED 3,142 / PARTIAL 86. 최근 24시간 요청은 SUCCEEDED 270 / PARTIAL 18, 대기·FAILED는 없음 | 모든 경기 자료가 완전하다는 판정은 하지 않음. PARTIAL은 선택적 자료 누락·시간 제한 등 여러 원인이고 현재 기록의 failure_code는 null이므로 개별 원인을 단정하지 않음 |
| 일반 경기 통계 | outbox 13건 모두 DELIVERED, 최신 전달 10/05 02:25:15 KST | 이 snapshot에서 대기/실패 없음. 아래 MMR 소비와 다른 경계 |
| 카카오 일일 마감 | 10/06 06:00:16 KST 제공자 요청 HTTP 200, 같은 시각 maintenance `SUCCEEDED` | 예약 시각의 실제 호출과 DB 업무 완료 대조 PASS. 기존 명단을 수동 변경하지 않음 |
| 문의 보존 정리 | 10/06 04:00:10 KST `/api/cron/support-retention` 제공자 HTTP 200 | 예약 경로의 실제 완료 응답 관측. 반환 삭제 건수나 개별 문의를 조회하지 않았고 수동 실행하지 않음 |
| 기타 cron | 멸망전 수집·통계·Riot의 HTTP 200 요청 관측 | HTTP 200만으로 모든 개별 수집의 완전성을 판정하지 않음. [제공자 로그 집계](cron-summary.json) |
| 카카오 충원 알림 | 현재 운영 `KAKAO_SITE_NOTICE_ENABLED=true`. 전역 큐 EXPIRED 1건, ACK 시각 없음. 보관된 인증 요청 3건의 최신 시각은 9/22 19:59:32 KST | 과거 OFF 기록은 현재와 다름. 실제 설치·대상 등록·현재 timer/poll·메시지 수신은 확인되지 않음. 대상이 명시되지 않아 진단 메시지도 발송하지 않음 |

제공자 로그는 정해진 1시간 범위 및 일일 작업 시각 전후의 반환 표본에서 경로를 직접 걸러 집계했다. 동일 deployment·path·timestamp·status 중복은 제거했다. HTTP status 0인 진행/불완전 기록 2건은 성공이나 실패로 세지 않는다. 전체 24시간의 모든 요청, scheduler 전용 발신자 증거, 장기 장애 부재를 주장하지 않는다.

## 새로 확정한 미완결 상태: MMR 공식 전환

MMR 공개 API와 운영 DB가 모두 generation 1, 공식 `V1_INTERNAL_MMR_1`, 계산 시각 2026-09-08 00:36:32 KST를 반환했다. 현 코드의 목표 공식은 `V2_DETERMINISTIC_1`이다. 공개 API의 `formulaTransition=ADMIN_RECALCULATION_REQUIRED`, 제공자 표본의 cron HTTP 409 7건, 저장소의 공식 보호 분기가 일치한다.

공개 원장에는 당시 경기 42개·게임 91개가 집계되어 있고 **MMR 미소비 경기 변경 이벤트 13건**이 남아 있다. 이는 서로 다른 경기 13개나 게임 13개라는 뜻이 아니다. 같은 경기의 수정 이벤트가 중복될 수 있으므로 실제 점수·순위 변화와 distinct 경기 영향은 별도 전환 분석을 따라야 한다. [공개 요약](mmr-public-summary.json), [읽기 전용 DB 집계](operational-readonly-result.json).

따라서 자동 MMR 반영은 현재 완료로 판정할 수 없다. 서버의 보호 정책을 없애거나 409를 200으로 숨기지 않았다. [MMR 운영 런북](../../operations/MMR_PROJECTION_RUNBOOK.md)은 현재/새 계산 영향 확인, 점수가 바뀌는 공식 전환의 운영자 확인, 기존 SUPER 관리자 인증·generation·멱등성·감사 경계의 전체 재계산, 후속 cron 검증을 요구한다. 본 점검은 원본 점수·generation·영수증을 변경하지 않았으며 전환 실행은 통합 담당의 별도 과업이다.

## 실제로 남은 조건

| 미확인 항목 | 현재 확인한 경계 | 필요한 구체적 조건 |
| --- | --- | --- |
| Riot RSO 소유권 확인 | Production에 `RIOT_RSO_CLIENT_ID`, `RIOT_RSO_CLIENT_SECRET`, `RIOT_RSO_STATE_SECRET` 세 설정이 없음. API 공개 전적 연결은 동작하지만 RSO와 다름 | 승인된 OAuth client와 정확한 callback, 별도 state 비밀, 동의할 계정 소유자의 실제 OAuth 진행. Riot은 production key와 별도 RSO 절차를 안내한다. [공식 RSO 문서](https://developer.riotgames.com/docs/lol#rso-integration), [OAuth client 문서](https://support-developer.riotgames.com/hc/en-us/articles/22897607341075-OAuth-Client-Documentation) |
| 카카오 실제 수신·백그라운드 | 서버 ON은 확인. 현재 phone session·수신/잠금화면/재시작은 관측 못 함 | 실제 MessengerBot R 기기, 운영자가 지정한 수신방, 설치본/버전 확인과 일회용 직접 등록, 정해진 시험 메시지/수신자. [companion 절차](../../../integrations/messengerbot-r/site-notices/README.md). 이 호스트에 `adb` 제어 명령도 없음 |
| 외부 경보 수신 | 앱은 운영 상태 조회만 제공하고 외부 경보 발송 기능을 새로 만들지 않음. 이번 제공자 로그/공개 API 메타데이터만으로 alert 설정·수신을 확인하지 못함 | 사용 중인 경보 제공자와 수신 채널/담당자 식별, 해당 설정의 조회 권한, 명시된 시험 알림 대상·허용. 임의 수신자/새 요금제를 만들지 않음 |
| 제공자 PITR·장애 전환 | 기존 논리 backup/restore 증거는 현재 PITR 실행 증거가 아님 | 실제 DB 제공자의 복구 권한과 격리 복구 목적지·복구 시각·비용/중단 범위 결정. 운영 원본에 복구 시험하지 않음 |
| iOS/Android·스크린리더·실회선 | 이번 공급자/서버 점검은 실기기 접근성·설치 앱·통신 품질 검사가 아님 | 대상 기기/OS/스크린리더와 제어 또는 결과 관측 경로. 브라우저 CSS viewport 결과로 대체하지 않음 |

현재 일반 조회·Blob provider·Riot status/갱신·일일 작업에서 확인한 범위는 기존 기능을 재사용해 검증했으므로 새 연동 공급자나 재시도 시스템을 추가할 근거가 없다. MMR 전환 대기, Riot 부분 자료의 개별 원인, 실제 수신·RSO·기기 조건은 완료 항목과 분리한다.
