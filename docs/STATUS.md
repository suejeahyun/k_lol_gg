# K-LOL.GG V2 상태

- 기준 커밋: `8bf9a3d` (`main`, 2026-09-01)
- 현재 단계: S00 공통 기반 + S01 인증/데이터 기반 + A0 관리자 정보 구조
- V1 코드 복사: 없음. V1은 동작 명세와 동등성 대조 근거로만 사용
- 운영 데이터·외부 연동: 연결하지 않음
- 운영 Vercel 전환: 하지 않음
- 전체 기능 동등성: **미완료**

## 확인된 완료 범위

- 독립 Next.js 코드베이스, 밝은 Community Breeze 토큰, 반응형 사용자 셸
- V2 전용 아리 히어로 이미지와 자산 해시 기록
- V1 사용자 UI 73/73, 관리자 UI 81/81, 비관리자 경계 Route Handler 112/112 전수 목록
- 플레이어 검색 포트·fixture·PostgreSQL 공개 projection 저장소 계약
- PostgreSQL 전진 migration, transaction, 인증·registry·audit schema와 repository
- 비운영에서만 허용되는 합성 계정의 비밀번호 → TOTP → HttpOnly 세션 검증
- 익명 관리자 차단, ADMIN 역할·상태·authVersion 재검증, 로그인·로그아웃 Origin 검사
- 보호된 관리자 10개 작업 공간 A0 셸과 데스크톱·모바일 시각 QA
- `npm run check` 통과: 계약 4개, 단위 19개, production build 20 routes
- 격리 PostgreSQL 18 계약 8/8 통과, 임시 cluster 정상 종료·경로 제거
- 실제 HTTP 관리자 인증 검증 통과, 런타임 `npm audit --omit=dev` 0건

## 출시 차단 조건

- 운영 세션의 DB `jti`·token hash 발급/조회/로그아웃 폐기 연결
- DB 기반 분산 로그인 제한과 TOTP AES-GCM keyring·등록 수명주기
- 사용자 73개 및 관리자 81개 V1 기능의 정상·빈 상태·오류·권한·mutation 동등성
- 운영과 분리된 전체 E2E fixture DB에서 ADMIN/SUPER 권한 검증
- 전체 반응형·키보드·스크린리더·감소된 모션·성능 예산·복구 훈련
- Riot/Kakao/Discord/Blob/APK 계약과 승인·서명·보존 정책의 운영 전 검증
- 비밀정보 검사와 깨끗한 Git 상태, 원격 대상 확인

## 알려진 위험

- 개발 전용 `drizzle-kit` 하위 esbuild advisory 4건(중간). 런타임 의존성은 0건이며, 제안된 강제 수정은 큰 하위 버전 변경이라 별도 호환성 검증 전 적용하지 않는다.
- 현재 관리자 업무 화면은 인증·정보 구조·빈 상태까지만 구현됐다. 실제 CRUD/승인/동기화/백업 기능으로 간주하지 않는다.
- 합성 fixture는 명시적으로 켠 비운영 환경에서만 허용되며 운영 인증 대체 수단이 아니다.

## 다음 순서

1. S01 운영형 DB 인증 내구성 연결 및 격리 E2E 완성
2. S02 사용자 플레이어 등록부와 관리자 CRUD를 같은 도메인 계약으로 완성
3. S03~S13을 사용자·관리자 기능 한 쌍씩 구현하고 동등성 표를 갱신
4. S14 전수 QA·성능·보안·복구·비밀정보 검사 후에만 Git 원격 브랜치 push
