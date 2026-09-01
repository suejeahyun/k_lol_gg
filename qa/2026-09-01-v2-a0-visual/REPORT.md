# V2 관리자 A0 시각·상호작용 검수

상태: **A0 기반 통과 / 전체 관리자 기능은 미완료**

## 범위

- 데스크톱 `1440 × 1000`: `/admin`, `/admin/players`
- 모바일 `390 × 844`: `/admin`, 모바일 전체 메뉴, `/admin/players`
- 테스트 진입: 실행 때만 존재하는 합성 ADMIN 계정으로 비밀번호 → TOTP → HttpOnly 세션의 실제 흐름 사용
- 운영 계정, 운영 DB, 운영 secret, 인증 우회는 사용하지 않음

## 확인 결과

- 관리자 10개 작업 공간이 데스크톱 사이드바와 모바일 전체 메뉴에 모두 표시됨
- 모바일 하단 `홈 / 작업 / 검색 / 메뉴` 4개 진입점 동작
- 현재 경로에 `aria-current="page"` 적용
- 모바일 문서 가로 overflow 없음
- 보이는 링크·버튼의 목표 크기를 최소 `44 × 44px`로 보정
- 모바일에서 숨겨지는 텍스트 대신 검색·보안 아이콘 링크에 명시적 accessible name 적용
- 대시보드의 `작업`이 홈을 다시 가리키던 오류를 `/admin/players` 기본 작업으로 수정
- 브라우저 console warning/error 0
- 데이터 미연결 영역은 가짜 수치나 활성 mutation을 보여주지 않고 `EMPTY / 미완료`를 명시

## 캡처

- `admin-dashboard-desktop.png`
- `admin-dashboard-mobile.png`
- `admin-mobile-menu.png`
- `admin-players-desktop.png`
- `admin-players-mobile.png`

## 제한과 다음 게이트

- 캡처는 개발 서버에서 수행되어 모바일 화면 왼쪽 아래의 Next.js 개발 도구 버튼은 제품 UI가 아니다. 운영 DB 기반 preview가 준비되면 production build에서 다시 캡처한다.
- 현재 A0는 정보 구조, 인증, 내비게이션, 빈 상태만 검증했다. V1 관리자 81개 경로의 실제 기능 동등성 완료 증거가 아니다.
- DB 저장소, 영속 세션 폐기, 분산 rate-limit, TOTP 등록/회전, 각 업무 mutation 구현 뒤 동일한 데스크톱·모바일 전수 검수를 반복한다.
