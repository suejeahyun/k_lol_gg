# 운영 배포 이후 자연 예약 동기화 관측

2026-10-07 13:06:09.891 KST의 읽기 전용 DB snapshot으로 확인했다. 운영 API를 실행하거나 재시도를 요청하지 않고 다음 5분 정기 실행 이후 한 번 조회했다. [원문 없는 집계 JSON](riot-post-deploy-readonly.json)에 결과를 보존한다.

| 확인 항목 | 관측 |
|---|---|
| 운영 source | `0716a60bf09654118cc40493481839d75269b3f7` |
| 최종 main 배포 | `dpl_73cLhShUqRnR9WcramzRNwDQRdAv`, READY / production |
| 운영 주소 | `https://k-lol-gg.vercel.app` |
| provider READY / alias 지정 | 13:01:16.976 / 13:01:17.261 KST |
| 집계 시작 | 두 시각 중 늦은 13:01:17.261 KST 이후 새로 요청된 JOB 작업만 |
| 자연 발생 작업 | 1건. 요청13:05:45.425 → 완료13:05:46.575 KST |
| 결과 | SUCCEEDED 1, failure_code=null |
| PARTIAL / 새 진단 코드 / 미지 코드 | 모두0. 새 PARTIAL 진단 저장은 **이번 표본에서 관측되지 않음** |

배포 metadata의 ID·SHA·READY·production·canonical alias를 대조한 뒤 실행했다. 기존에 확인한 운영 환경 metadata 바인딩과 알려진 storage-probe 성공 기록도 다시 대조했다. 환경 metadata 자체는 오늘 앞선 인증 조회 결과를 재사용했으며 이번 DB 조회에서 provider API를 새로 요청하지 않았다.

`REPEATABLE READ READ ONLY`와 `transaction_read_only=on`을 확인하고 statement10초/query15초 제한을 적용했다. ROLLBACK으로 끝났다. SQL은 상태·유한 코드·건수·집계 시각만 반환하며, 미지 코드는 원문 대신 `UNRECOGNIZED_CODE`로 마스킹한다. 회원·계정·작업 식별자·PUUID·요청/응답 본문은 읽기 결과나 증거에 보존하지 않았다. 기존 대기 작업, 회원/관리자 요청과 과거 PARTIAL19건은 대상에 포함하지 않았다. 운영 데이터 변경·수동 동기화·Riot API 소비는 없다.

이 결과는 배포 이후 자연 동기화가 계속 정상 완료된다는 표본이다. 개별 작업에 deployment ID가 저장되지는 않아 JOB 범주와 배포 이후 시간 창을 대조한 증거이며, 모든 연결 계정의 완전성을 뜻하지 않는다. PARTIAL이 발생하지 않았으므로 새 코드의 실제 운영 저장까지 통과했다고 쓰지 않는다. 그 저장·관리자 조회 경로는 [격리 DB 검증](v107-browser-final-retry-database.log), [구현 회귀](riot-partial-diagnostics.md), [독립 재검토](riot-independent-review.md)와 구분한다. 과거19건의 원인을 소급 복원하거나 재작성하지 않았다. 완료된 동일 표본을 반복 조회하지 않았다.
