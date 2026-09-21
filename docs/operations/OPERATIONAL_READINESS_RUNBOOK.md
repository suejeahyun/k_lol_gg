# 운영 준비 패치 실행·복구 기준

이 문서는 실행 절차다. 실제 통과·배포 결과는 [운영 준비 1.0.0 증거](../qa-evidence/operational-readiness-v1.0.0-2026-09-22/README.md)를 기준으로 한다. 과거 릴리스 증거를 현재 상태로 덮어쓰지 않는다.

## 배포와 DB

1. 운영 alias의 배포 ID·source SHA, 원격 main/작업 브랜치와 DB migration journal을 대조한다.
2. 운영 DB를 read-only snapshot으로 논리 백업하고 별도 로컬 DB에 복원한다. 원본의 행 수·컬럼·제약조건·migration head를 비교한다. 운영 DB는 복원 대상으로 사용하지 않는다.
3. 0042~0044는 알림 큐·팀 전용 보정 테이블과 nullable Riot 최근경기 요약, 그 CHECK 보완이다. 기존 명단·회원·MMR 원장을 일괄 수정하지 않는다. 격리 DB fresh/upgrade/replay 검사와 전체 검사가 먼저 통과해야 한다.
4. 검토한 SQL hash와 운영 target fingerprint, 직전 head를 검사한 뒤 forward migration을 적용한다. 5초 lock timeout·30초 statement timeout·release advisory lock을 사용하고 재실행이 no-op인지 확인한다.
5. source commit을 고정해 production 후보를 `--skip-domain`으로 생성한다. 후보의 health·보호 경계·Blob 왕복을 확인한 뒤 alias를 승격하고 다시 확인한다. 비공개 파일·`.tmp`·환경 파일은 배포 입력에서 제외한다.
6. rollback은 이전 READY 배포를 재승격한다. 이번 스키마는 이전 앱과 호환되는 추가 변경이므로 긴급 down migration을 만들지 않는다. DB 복원은 백업 이후 실제 쓰기 손실 범위를 먼저 계산해 별도 결정한다.

운영 코드와 main을 fast-forward로 맞춘 후 배포 증거만 기록하는 commit은 runtime을 교체할 필요가 없다. `ignoreCommand`는 현재 checkout과 **해당 branch의 마지막 성공 배포 SHA** 사이 전체 diff가 `docs/`·`README.md`뿐일 때만 빌드를 생략한다. 첫 배포·같은 commit 수동 재배포·shallow history 누락·비정상 SHA·소스/설정 변경은 빌드한다. 마지막 commit만 비교해 앞선 미배포 코드 변경을 놓치지 않는다. [Vercel 시스템 변수](https://vercel.com/docs/environment-variables/system-environment-variables#vercel_git_previous_sha)와 [ignoreCommand 계약](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand)을 기준으로 한다.

백업은 사용자 데이터가 포함되어 `.private/recovery/`에만 보관하며 Git·공개 QA에는 경로·SHA-256·검사 결과만 남긴다. PostgreSQL 17→18 복원에서 물리 컬럼 번호 간격, NOT NULL 카탈로그와 CHECK 표현식 문자열이 달라질 수 있다. 논리 컬럼 순서/타입/nullability를 비교하고 원본 CHECK를 복원 서버에서 파싱한 뒤 정확히 비교한다. 제공자 PITR과 전체 장애 전환은 별도 검증이다.

## 예약 작업과 관측

- 통계: 5분 주기, 호출당 최대 10건·다음 claim 20초 한도. [통계 런북](STATISTICS_PROJECTION_RUNBOOK.md)을 따른다. 배포 직전 PENDING 4건·마지막 계산 2026-09-07이 관측됐으며, 반영 후 실제 소비 결과를 증거에 기록한다.
- 카카오 마감: 매일 06:00 KST. 지난 내전은 신규 모집만 닫고 신청·예비·미연결 명단을 보존한다. 빈 DRAFT만 작성 취소 상태가 된다. 기존 완료 nonce는 같은 운영일에 다시 실행해도 중복 적용하지 않는다.
- 알림 정리: 마감 transaction에서 만료 active와 보관기간 지난 terminal을 각각 최대 500건 처리한다. companion이 꺼져도 정리가 가능하다. 알림 활성화·실기기 설치와는 별개다.
- 카카오 요청 로그: `KAKAO_V4_COMMAND_COMPLETED`에 고정 경로·trace ID·상태·재생 여부·소요 밀리초만 남긴다. `Server-Timing`으로 서버 처리 시간을 확인할 수 있다. 명령 원문·방·발신자·명단·서명은 기록하지 않는다.
- 실패 판정: 통계 FAILED/oldest pending 증가, READY 갱신 지연, 예약 503, 저장소 probe FAILED 또는 장기 RUNNING을 조사한다. 제공자 경보의 실제 수신은 별도 확인하며, 코드 로그만으로 경보가 연결됐다고 간주하지 않는다.

## 실제 이미지 저장소 검사

`POST /api/internal/jobs/storage-probe`는 별도 `OPERATIONS_JOB_SECRET` 서명과 timestamp/nonce를 확인한다. 인증 후 서버 생성 UUID의 새 진단 이미지 한 개만 업로드·내용검사·삭제·삭제확인을 수행한다. 기존 콘텐츠와 DB 자산 행은 변경하지 않는다. 모든 결과는 `operations.maintenance_runs`에 기록하고 5분 내 중복 probe는 429로 제한한다.

```powershell
npx tsx scripts/operations/probe-storage.ts --origin https://k-lol-gg.vercel.app --secret-file .private/operations-job-secret.txt --output .private/storage-probe-result.json
```

비밀값을 명령행 인수·화면에 출력하지 않는다. 비밀 파일 없이 실행할 때는 프로세스의 `OPERATIONS_JOB_SECRET`을 사용한다. CLI는 승인된 운영/해당 프로젝트 후보 origin만 허용하고 HTTP redirect를 따르지 않는다. `VERCEL_BLOB_PRIVATE`, HTTP 200, 네 단계 모두 1일 때 실제 provider 왕복으로 판단한다. 앱의 사용자 업로드/권한/메타데이터 전체 E2E와는 구별한다. OIDC 개발 인증이 거절되면 운영 인증 오류로 단정하지 말고 후보의 실제 runtime에서 검사한다.

실패 시 nonce를 재사용하거나 무제한 재시도하지 않는다. trace ID의 UUID가 진단 key와 연결되므로 `readiness/storage/<UUID>` 잔존 여부를 확인한다. 임의 prefix 삭제는 하지 않는다. 60초 함수 제한 중 외부 timeout/최종 감사 실패로 RUNNING이 남으면 해당 run을 조사한다.

## 외부 설치와 현재 제한

- 알림 companion은 MessengerBot 앱 **0.7.29a**용으로 준비한다. 기존 R24/R25 일반 명령 코드와 별도이며, 단순 버전 문구 때문에 교체를 요구하지 않는다. [설치 안내](../../integrations/messengerbot-r/site-notices/README.md)의 대상방 등록·실제 기기 확인 후에만 서버/폰 스위치를 켠다. SDK 수락과 실제 카카오 수신은 다르다.
- Riot RSO 승인·client 자격·암호화 키·사용자 동의가 없으면 비활성 상태를 유지한다. 최근 솔로 요약 공급과 팀 보정의 [별도 절차](TEAM_BALANCE_AUXILIARY_DATA_RUNBOOK.md)를 따른다. 기존 값을 추정해서 채우지 않는다.
- 실제 Android/TalkBack, 휴대폰 절전·재시작, 실카카오 송수신, 실계정 Riot, 제공자 경보 수신은 합성 QA로 대체하여 완료 처리하지 않는다.
