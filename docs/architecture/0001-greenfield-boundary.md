# ADR-0001: V2 Greenfield 경계

## 결정

V2는 V1 저장소·코드·환경 변수·운영 데이터와 분리된 독립 코드베이스로 개발한다.

## 반드시 지킬 규칙

- V1 파일을 복사하거나 V1 내부 구현을 import하지 않는다.
- 계승 대상은 기능 계약, 데이터 의미, 권한 정책, 상태 전이, 오류 정책뿐이다.
- 운영 PostgreSQL, Blob, Riot, Kakao, Discord 자격 증명에 개발 환경을 연결하지 않는다.
- 초기 개발과 테스트에는 합성 fixture만 사용한다.
- 페이지와 Route Handler에서 데이터베이스 클라이언트를 직접 호출하지 않는다.
- `route/page → application service → repository interface → infrastructure` 순서를 지킨다.
- 모듈은 다른 모듈의 내부 파일 대신 공개 계약만 사용한다.
- 모바일과 데스크톱은 같은 URL·기능을 공유하고 반응형 UI로 제공한다.

## 배포 경계

- V1 운영 프로젝트와 도메인은 V2 완성 전까지 유지한다.
- V2는 향후 별도 Vercel 프로젝트·DB·Blob·환경 변수를 사용한다.
- 운영 전환 전에는 V1/V2 간 실시간 이중 쓰기를 하지 않는다.
- 최종 이관은 V1 읽기 전용 추출 → V2 단방향 적재 → 정합성 검증 순서로 한다.

## 디렉터리 원칙

```text
src/
├─ app/                    # 라우팅과 조합
├─ modules/<feature>/
│  ├─ domain/              # 순수 도메인 타입·규칙
│  ├─ application/         # 유스케이스
│  │  └─ ports/            # 저장소·외부 의존성 인터페이스
│  ├─ infrastructure/      # DB·외부 연동 어댑터
│  ├─ contracts/           # 공개 입출력 계약
│  ├─ ui/                  # 기능 UI
│  └─ index.ts             # 포트와 어댑터를 조합하는 공개 진입점
├─ platform/               # 인증·DB·보안·관측·작업
└─ components/ui/          # 공통 접근성 프리미티브
```
