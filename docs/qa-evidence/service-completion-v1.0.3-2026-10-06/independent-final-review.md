# 1.0.3 통합 변경 독립 교차 검토

2026-10-06 KST. 각 구현 담당자의 diff, 실제 공통 컴포넌트와 생성 CSS, focused 검증 근거를 읽고 실제 컴포넌트 회귀를 함께 실행했다. 이 검토에서는 제품 소스를 수정하지 않았다. 현재 검토 범위에서 추가 중대 오류나 명확한 주요 과업 방해 요소는 발견하지 않았다.

## 검토 범위와 판단

| 범위 | 확인 내용 | 판단 |
| --- | --- | --- |
| 홈 랭킹 선택 | 기존 하나의 슬라이드 앞에 승률·최다 참여·최다 MVP가 모두 이름으로 표시되고 `aria-pressed`로 현재 선택을 알린다. 직접 선택·좌우 방향키·이전/다음·재생 제어를 유지하며 직접 선택은 자동 넘김을 정지한다. 기본 자동 재생은 꺼져 있다. 빈 목록/한 종류에서 불가능한 이동 제어를 노출하지 않는다 | 기존 불명확한 점 선택과 다음 종류 안내를 합쳐 기능 발견을 돕는다. 랭킹 집계/API 및 홈 여섯 영역의 순서는 변경하지 않는다 |
| 랭킹 공통 Button 및 CSS | 실제 `Button`의 기본 `h-8`, `whitespace-nowrap`, ghost hover와 모듈 규칙을 대조했다. 현재 생성 CSS를 PostCSS로 읽어 기본 규칙은 `@layer utilities`, `kindButton`은 layer 밖이고 `height:auto`, `min-height:44px`, `white-space:normal`, 선택·hover 색이 적용되도록 생성됨을 확인했다. globals에는 이를 덮는 버튼 `!important` 규칙이 없다 | 기본 32px 높이나 ghost hover가 새 선택 표시를 덮는 충돌을 발견하지 않았다. reduced-motion에서는 슬라이드 animation과 선택 버튼 transition이 제거된다. 브라우저에서 계산된 크기·색을 측정한 결과는 아니다 |
| 신청 메뉴 | 실제 메뉴는 pathname뿐 아니라 `type` 쿼리를 반영한다. 기본/season·event·destruction에는 각각 현재 링크 하나, 잘못되거나 중복된 type에는 현재 링크가 없다. 쿼리 이동 뒤 열린 메뉴를 닫는 effect 정리도 유지한다 | 이벤트전·멸망전을 오늘 내전으로 표시하던 오인을 바로잡는다. 새로운 경로나 기능을 추가하지 않는다 |
| 팀 만들기 검색 | 느린 검색 중 입력 삭제·입력 초기화가 요청 abort와 함께 로딩 상태를 끝낸다. 취소된 과거 요청의 finally가 새 검색 상태를 지우지 않는 보호는 유지된다 | 요청 상태와 화면 상태 불일치를 수정하며 후보 선택·저장·권한 처리를 바꾸지 않는다 |
| 신청 포지션 표시 | 폼에서 쓰던 한국어 표시를 공유하고 실제 저장 enum은 유지한다. 여섯 값 모두 내 상태·공개 명단에 같은 라벨을 사용한다. 칼바람·증강 칼바람의 `포지션 구분 없음`도 유지한다 | 입력 이후 영문 코드가 나타나던 혼란을 없앤다. 주·부 포지션 정책 및 데이터는 불변이다 |
| 경기 제출 전체 | 필수 입력 우선, 선택 정보 native details, 코드 이어하기 보조 배치, 실제 업로드 수에 따른 완료 단계, 종결 상태별 다음 행동을 검토했다. 필드 name·null/KST 직렬화·팀 초안 연결·접수 문맥 key·로그인 복귀·권한 early return·조회 실패 복구·생성 후 navigation 잠금은 유지된다 | 초기 교차 검토에서 찾은 코드 이어하기 실패 시 신규 폼 우선 문제는 `recoveringCode` 분기로 수정되어 재검증됐다. 상세 근거는 [제출 교차 검토](submission-cross-review.md)에 있다 |
| 404 경계 | root는 전체 public shell, public은 기존 layout 안의 내용, admin은 기존 권한 layout 안의 내용만 렌더한다. 실제 셸 조합에서 중복 main/header/footer/skip link를 만들지 않는다 | 중복 shell의 공통 원인을 해소했다. streaming HTTP 증거와 최종 DOM 증거는 구분한다 |

## 독립 실행과 담당자 근거

현재 설치된 Next.js 16.3.8 작업 공간에서 다음 명령이 exit 0으로 완료됐다. 22개 모두 통과했으며 생략·실패는 없다.

```text
node --test tests/home-ranking-carousel.test.mjs tests/first-visit-interactions.test.mjs tests/application-navigation.test.mjs tests/match-submit-continuation.test.mjs tests/not-found-layout.test.mjs
tests 22 / pass 22 / fail 0 / skipped 0
```

이 검증은 실제 소스의 JSX, 이벤트, effect cleanup, 상태 전이 및 서버 페이지/셸 조합을 실행한다. 필요한 네트워크·라우터·시간·인증 응답만 격리한다. 브라우저 hydration, 실제 스크린리더 또는 기기 시험을 대체하지 않는다.

- [홈 랭킹 focused 로그](home-ranking-focused.log): 새 선택 동작 4개와 기존 홈 계약 7개 통과. [발견·수정 근거](home-ranking-discoverability.md)와 [계산 대비 값](home-ranking-contrast.json)은 실제 픽셀 측정과 구분돼 있다.
- [메뉴·검색·포지션 검증](navigation-search-positions.md): 메뉴/로딩 문제의 수정 전 실패, 수정 후 실행 회귀 및 기존 팀·신청 정책 검사가 기록돼 있다.
- [제출 focused 로그](submission-cross-review.log): 8개 통과. 코드 복구 문맥과 부분 업로드 취소 완료 표시를 별도로 확인했다.
- [404 구성 로그](not-found-layout.log): 실제 root/public/admin 조합 3개 통과. [격리 HTTP 로그](not-found-http-after.log)는 noindex·404 경계 신호·초기 shell·관리자 로그인 복귀와 synthetic 쓰기 과업을 확인한다. HTTP 응답이 streaming이면 200과 404 digest가 함께 올 수 있어 최종 DOM으로 오인하지 않는다.

## 릴리스 단계에 남겨 둔 실제 검증

이 문서 작성 시점에는 아래 항목을 완료로 표시하지 않는다. root의 최종 optimized fixture와 배포 후 검증 기록에서 결과를 연결해야 한다.

1. **실제 CUA:** 320/390px 및 PC에서 홈 랭킹 세 선택 버튼의 줄바꿈·크기·선택색, Tab/Enter/Space/방향키와 포커스, 직접 선택 후 자동 넘김 정지. 모션 감소 설정에서 전환 애니메이션 제거. 실제 모바일 기기나 스크린리더는 별도 조건이 필요하다.
2. **제출 실제 입력:** 추가 정보를 열어 입력한 뒤 닫아도 시즌·시각·메모가 유지되어 요청에 포함되는지, 생성 → 코드 이어하기 → 새 접수, 본인에게 없는 코드의 복구 우선 화면, 좁은 화면의 긴 코드·제목 및 키보드 조작.
3. **404 최종 DOM:** 잘못된 제출 코드, 존재하지 않는 플레이어·경기, 알 수 없는 URL, 인증된 관리자의 없는 경기에서 해당 shell/주요 landmark가 한 번만 나타나고 복구 링크가 작동하는지. 비로그인 관리자 접근은 로그인으로 이어져야 한다.
4. **Next 보안 패치 이후:** 과거 Next 버전에서 통과한 격리 DB/HTTP 로그를 16.3.8 결과로 재사용하지 않는다. 새 optimized 서버에서 로그인·세션/권한 경계·404와 주요 쓰기 과업을 확인하고, 필요 DB 범위 및 release check 완료 여부는 담당자의 실제 실행 결과로 판단한다. 현재 [의존성 점검](security-dependencies.md)의 잔여 개발 도구 경고·산출물 trace 검증과도 구분한다.
5. **운영 배포:** 최종 통합 check의 프로세스 종료 결과, 새 빌드·커밋·배포 버전, 운영 주소와 배포 후 화면 결과는 릴리스 담당 기록에서 확정한다. 이 검토는 운영 데이터 변경이나 운영 인증 계정을 이용한 쓰기 시험을 수행하지 않았다.

수정 필요성이 입증되지 않은 새 기능, 새 API 또는 디자인 전면 변경을 추가할 이유는 이 검토 범위에서 발견하지 못했다. 이는 전체 서비스나 미검증 외부 연동·실기기에 더 할 일이 없다는 판단이 아니다.
