# V2 S01 관리자 인증 수명주기 2차

## Discord 복붙 공지

```text
🔐 K-LOL.GG V2 관리자 보안 패치 후보

- 관리자 보안 화면에서 2단계 인증 상태 확인, 등록 시작, 활성화, 자기 계정 해제를 실제 DB 흐름으로 연결했습니다.
- 새 등록 키는 생성 성공 응답에서 한 번만 보여 주며 DB에는 AES-256-GCM 암호문만 저장합니다.
- 활성화·해제 시 계정 인증 버전을 올리고 모든 세션을 즉시 종료한 뒤 다시 로그인하도록 변경했습니다.
- 보안 변경과 세션 종료, 감사 기록은 하나의 PostgreSQL 트랜잭션으로 처리합니다.
- 다른 관리자 계정을 대상으로 한 요청은 허용하지 않고 ADMIN/SUPER_ADMIN 자기 계정만 처리합니다.
- 잘못된 출처·JSON 형식·과대 요청·코드 재사용을 고정된 안전 오류 형식으로 거부합니다.

검증: 단위 테스트 59개, PostgreSQL 18 계약 14개, 실제 DB HTTP 수명주기, 기존 인증 HTTP, production build 통과
운영 반영: 아직 하지 않음 (V2 후보 브랜치만)
```

## 남은 출시 게이트

1. SUPER_ADMIN 최초 bootstrap과 복구 코드 정책
2. SUPER_ADMIN의 타인 TOTP reset 정책과 별도 승인·감사 흐름
3. 이전 TOTP key 재암호화·rotation·key escrow 복구 훈련
4. 운영 migration/cleanup scheduler, 관측·경보, WAF·신뢰 IP 검증
5. 메모리 fixture를 격리 PostgreSQL fixture로 완전 이전

현재 구현은 운영 배포 또는 S01 전체 완료를 뜻하지 않는다.
