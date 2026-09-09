# R14.2 운영 인계

Production 배포와 Neon migration은 이 소스 작업에 포함하지 않았다. 아래 순서를 분리하지 말고 같은 점검 시간에 수행한다.

## 적용 전 read-only preflight

```sql
select i.public_id, count(distinct b.room_id) as distinct_room_count
from recruiting.kakao_bot_installations i
left join recruiting.kakao_room_bindings b on b.installation_id = i.id
group by i.id, i.public_id
having count(distinct b.room_id) > 1;
```

결과가 한 행이라도 있으면 migration을 적용하지 않는다. 자동 병합·삭제하지 말고 어떤 canonical room을 유지할지 운영자가 결정한다.

## 적용 순서

1. DB 백업과 복원 경로 확인
2. `drizzle/0033_tan_sprite.sql` 적용
3. 동일 commit 서버 배포
4. health·DB `select 1`·migration head 확인
5. private R14.2 installer 휴대폰 전체 교체
6. 설치본 pairing과 실제 명령 smoke

## 실패 시

- 0033이 `KAKAO_INSTALLATION_MULTIPLE_ROOMS`로 실패: transaction rollback을 확인하고 데이터 수정 없이 중지한다.
- 서버 smoke 실패: R14.2 휴대폰 봇을 중지하고 이전 서버 배포로 rollback한다.
- 이미 0033이 적용된 뒤 DB rollback이 필요: 먼저 서버/봇을 이전 버전으로 되돌리고, 백업 복원을 우선한다. 수동 down migration은 `canonical_room_id` FK·index·column만 대상으로 별도 승인·백업 후 수행한다.

비밀값, private installer 본문, 전체 installation/sender ID는 로그·채팅·Git에 남기지 않는다. public source와 private handoff artifact의 SHA-256만 기록한다.
