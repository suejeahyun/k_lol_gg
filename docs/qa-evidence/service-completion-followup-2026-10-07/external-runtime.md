# 운영·외부 연동 읽기 전용 재확인 — 2026-10-07

확인 시각 12:09~12:10 KST. 작업 HEAD `5c51fe5149074f686cd8900e42e821d1cf92226a`, 운영 source `c9431b9e68b468c17d02c6ff7595de7e14a7c9c8`를 구분한다. [기존 10/06 실제 공급자 점검](../service-followup-2026-10-06/external-runtime.md)을 오늘 실행한 결과로 재사용하지 않고, provider metadata·공개 GET·예약 요청 로그·DB 집계만 새로 읽었다.

## 실제 관측

| 대상 | 현재 관측 | 해석 |
|---|---|---|
| 운영 배포/health | canonical `https://k-lol-gg.vercel.app`와 `dpl_HuMGR69n3o964U2CnZZicYHCKhW7` 일치, production READY, source `c9431b9e…`; health HTTP200/ready/no-store | 현재 운영 버전 확인. [runtime-summary.json](runtime-summary.json) |
| MMR | 공개 API와 DB 모두 generation1, `V1_INTERNAL_MMR_1`, `ADMIN_RECALCULATION_REQUIRED`, 42회/91게임, 계산 9/08 00:36:32 KST. 미소비 경기 변경 이벤트13건. cron 표본18회 모두409 | 공식 전환이 아직 실행되지 않았으며 최신 MMR 자동 반영은 완료 아님. 이벤트13건을 서로 다른 경기13개라고 세지 않음 |
| 일반 시즌 통계 | 기존 outbox13건 모두DELIVERED, 최신전달 10/05 02:25:15 KST. 예약표본18회 모두200 | 이 집계의 대기/실패 없음. MMR은 별도 소비 영수증으로 보호됨 |
| Riot 자동 동기화 | CONNECTED103건, 요약120건. 최신 티어/최근솔로 갱신 12:05:48 KST. 최근24시간269 SUCCEEDED/19 PARTIAL, FAILED·대기 상태 없음. cron표본18회200 | 실제 운영 요약이 계속 갱신됨. PARTIAL19건은 선택적 자료/시간제한 등 개별 원인을 조사하지 않아 완전 성공으로 표시하지 않음 |
| 카카오 일일 마감 | 10/07 06:00:16 KST provider200, 같은 초 maintenance SUCCEEDED | 예약 요청과 DB 작업 완료 대조. 수동 마감이나 기존 명단 수정 없음 |
| 문의 보존 | 10/07 04:00:10 KST provider200 | 실제 예약 응답 관측. 삭제 건수/개별 문의는 읽지 않았고 수동 실행 없음 |
| 멸망전 수집 | 해당 표본90회200 | 요청 성공 표본이며 대상이 없는 IDLE·모든 선수 전적의 완전성을 별도로 확인한 것이 아님 |
| 카카오 충원 알림 | EXPIRED2건, ACK 없음. 보관된 인증요청3건, 최신 9/22 19:59:32 KST | 어제 EXPIRED1건에서 늘었다. 실제 현재 기기 poll·수신은 증명되지 않음. 임의 대상 방/메시지를 만들거나 전송하지 않음 |
| RSO 구성 | client ID/secret/state 3개 설정 부재, redirect URI만 존재 | 별도 승인 OAuth 소유권 확인 미구성. 공개 전적 연결·자동 요약과 다른 기능 |
| Blob/status 진단 | 저장된 최신 storage-probe·riot-api-probe는 10/06 실행의 SUCCEEDED | 오늘 다시 provider 업로드/삭제/status POST를 호출하지 않았으므로 신규 왕복 PASS로 표시하지 않음 |

현재 [DB 집계](operational-readonly-result.json), [cron 표본](cron-summary.json), [환경 존재 여부](external-config-summary.json)에 원문 회원/방/계정/요청 본문을 저장하지 않았다. Vercel 원본은 ignored 비공개 파일에서만 처리했다. cron은 최근1시간과 오늘04시/06시 전후 각15분의 표본146건이며 경로·시각·deployment·status 중복을 제거했다. 전체24시간의 모든 호출이나 scheduler 발신자 인증까지 입증하는 로그가 아니다.

현재 환경 API의 세 비밀 아닌 feature switch 값도 암호화되어 직접 읽히지 않았다. 따라서 오늘의 flag 값을 임의로 true/false라고 기재하지 않는다. 설정 존재, DB Riot feature=true, 실제 요약 시각과 예약 결과를 구분한다. API 키 등 민감값과 소유자 metadata는 출력하지 않았다.

## 읽기 전용 DB 바인딩과 안전 경계

기존에 인증된 운영 storage probe와 대조했던 연결을 재사용했다. production DATABASE_URL 설정의 ID와 updatedAt이 당시 metadata와 같고, 동일 probe run의 성공·realStorage 기록이 같은 DB에 존재하며, 지금 공개 API의 MMR generation/공식/집계/시각/대기 수가 DB와 일치함을 확인했다. 과거 파일 이름만 보고 운영 바인딩이라고 추정하지 않았다.

연결 후 `REPEATABLE READ READ ONLY`와 `transaction_read_only=on`을 확인했고 statement10초/query15초 제한을 적용했다. 결과를 `ROLLBACK`으로 종료했다. 계정·신청·경기·영수증·nonce·maintenance를 생성/수정하지 않았고, 예약 URL 직접 실행·연결/해제·메시지발송·새 키 발급·환경 변경·MMR 재계산을 하지 않았다.

## 남은 조건의 재분류

| 항목 | 실제 필요한 조건 | 로컬에서 계속 가능한 것 |
|---|---|---|
| 운영 MMR 공식 전환 | 기존 APPROVED/SUPER_ADMIN의 유효한 ADMIN-purpose 로그인, 강제 비밀번호 변경 해소, 실행 직전 현재 영향/복구 범위 확인. 광범위한 개선 허가를 반복 요구하는 문제가 아니라 서버가 실제 인증을 요구하는 경계 | 공식 전환·중복·충돌·실패 rollback·전환 후 cron은 격리 DB에서 검증 가능하고 기존 근거 있음. DB 자격으로 세션을 위조하거나 직접 점수 포인터를 바꾸지 않음 |
| Riot RSO | 승인 OAuth client/client secret/state, 정확한 callback, 실제 소유자의 동의 진행. 현재 필수3키 없음 | fake gateway의 지연/429/연결 해제 경쟁, 화면의 API-only/RSO 구분은 로컬 검증 가능 |
| 카카오 실제 수신/절전·재시작 | MessengerBot R 기기, 지정된 방, 설치본/등록 상태와 허용된 시험 메시지/수신자 | 서명/nonce/installation·room 범위, 중복 ACK, 서버 큐/만료의 합성 검사 가능. UI나 HTTP 전체 미실행을 기기 부재 탓으로 돌리지 않음 |
| 모바일 설치/스크린리더 | 대상 OS·브라우저/보조기술을 실제 조작·관측할 경로 | viewport·키보드·포커스·reduced-motion emulation·설치 handler 합성 검사는 로컬 가능. 실제 도구 confirm 제한은 기기/소유권 제한과 별도 |
| 외부 경보 | 사용 중인 제공자/수신채널·담당자 식별과 조회 권한, 명시된 시험 수신 대상 | 상태 집계·임계값·실패 분기·익명성은 로컬 검증 가능. 임의 수신자/새 비용을 만들어 시험하지 않음 |
| Provider PITR/실장애 전환 | 제공자 복구 권한, 별도 복원지·시점·비용/중단 범위의 실제 결정 | 논리 backup/restore는 격리 검증 가능. [10/06 실제 운영 archive 복원](../service-followup-2026-10-06/mmr-transition-review.md)은 이미 확인했으나 오늘의 최신 백업/PITR 실행이나 Blob 원본 복원을 뜻하지 않음 |
| 실제 OCR 정확도/장시간 부하 | 허용된 대표 이미지·정답, 제공자 실행 조건과 부하 범위 | 파일 제약·실패/재시도·검토/반려·정합성과 짧은 성능 표본은 로컬 합성 자료로 계속 검증 가능 |

이 관측으로 새로운 공급자나 예약 시스템을 추가할 근거는 발견하지 못했다. 기존 MMR 전환 대기와 카카오 실제 수신 미확인은 여전히 해결된 것으로 표시할 수 없다. [기존 전환 영향·복구 검토](../service-followup-2026-10-06/mmr-transition-review.md)의 10/06 미리보기는 실행 직전 원장/플레이어 상태가 바뀌었는지 재확인해야 하며, 오늘의 상태 조회를 새 점수 미리보기로 표시하지 않는다.
