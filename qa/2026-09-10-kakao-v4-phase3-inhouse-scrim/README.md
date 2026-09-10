# Kakao V4 Phase 3-A — 내전·멸망전 스크림

## 범위

- 작업 브랜치: `feat/kakao-v4-phase3-inhouse-scrim-20260910`
- 기준 커밋: `288d5a50c5236239613783ac2c9e9a667fdf9264`
- V4 FEATURES: V1 내전 종목 선택, 협곡·칼바람·증바람 양식, 전체 회차 현황, 회차 상세, 협곡 authoritative 전체 명단 동기화
- V4 RECRUIT: V1 멸망전 스크림 양식, 현황, 상세, 신규·수정 전체 양식 upsert
- 제외: DB 적용, Vercel 배포, 원격 push, secret 변경

## 확인된 동작

- 내전 협곡 전체 양식은 1번부터 정원까지 모든 줄을 요구하며, 빠진 참가자를 취소하는 authoritative snapshot으로 전달된다.
- 0명 양식과 A→B→A 변경이 입력당 한 번의 season snapshot 호출로 전달된다.
- 칼바람·증바람은 V1 정책대로 이름 전용 모집 양식만 생성하며 시즌 명단에는 저장하지 않는다.
- V4가 season ID를 받지 않은 경우 저장 트랜잭션 안에서 ACTIVE 시즌이 정확히 하나일 때만 선택한다. 0개는 NOT_FOUND, 2개 이상은 CONFLICT다.
- 스크림 자동 번호는 durable receipt claim 뒤 mutation 트랜잭션의 advisory lock 안에서 저장소의 해당 운영일 마지막 번호를 기준으로 할당하며, 1~99 범위를 벗어나면 거부한다.
- 기존 스크림 번호는 같은 방·운영일의 활성 aggregate에서 revision과 대회 바인딩을 읽어 수정 시 그대로 보존한다.
- 대회 번호가 없는 신규 스크림은 기존 Recruiting application의 단일 활성 멸망전 추론을 그대로 사용한다.
- 스크림 upsert는 읽기 전용 저장소 해석 뒤 변경 호출 한 건만 V4 durable event receipt를 소유한다.
- 동일 eventId 재수신은 실제 변경 1회와 동일 답변 replay로 처리된다.
- sender role, owner 입력 또는 새로운 권한 등급은 추가하지 않았다.

## 운영 반영 상태

- 소스·테스트·빌드: 반영 및 검증됨
- 운영 DB·Vercel·카카오 설치본: 미반영

## 남은 위험

- 기존 번호 스크림을 동시에 수정하면 먼저 반영된 revision 이후 요청은 안전하게 revision conflict로 실패할 수 있으므로 최신 양식을 다시 받아 재전송해야 한다.
- ACTIVE 시즌이 복수이면 안전하게 실패한다. 운영 데이터에서 복수 ACTIVE 시즌이 생기지 않도록 관리자 수명주기 점검이 필요하다.
