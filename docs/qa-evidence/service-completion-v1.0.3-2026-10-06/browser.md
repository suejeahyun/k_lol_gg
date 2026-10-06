# 1.0.3 실제 브라우저 검증

2026-10-06 KST. CUA의 실제 Chromium 브라우저를 사용했다. 합성 계정·파일을 쓰는 격리 환경과 운영의 읽기 전용 확인을 구분한다. 실제 신규 사용자 관찰 연구, 실물 휴대폰 또는 스크린리더 시험 결과는 아니다.

## 격리 환경의 완료 과업

- source `824502a20065c4d2d84d3676e9db47028ca6c913`, Next.js 16.3.8, build `HgrFb7yHtyih42uuOP4X7`을 사용했다. 최종 `npm run check`로 만든 optimized build에 전체 DB 계약 실행을 마친 뒤의 synthetic fixture를 연결했다. origin은 `http://127.0.0.1:57351`이었다.
- ACCOUNT 로그인 후 결과 제출로 복귀했다. 390×844에서 경기 제목·주최자·날짜를 입력하고 추가 정보를 열어 시즌·시작 시각·메모를 입력했다. 추가 정보를 닫은 뒤 생성했고, 생성된 접수를 다시 수정 화면에서 열어 선택 정보가 모두 저장되어 있음을 확인했다.
- 서로 다른 합성 PNG 두 장을 실제 파일 선택기로 등록했다. 1/2 → 2/2 → `PENDING_REVIEW`와 3단계 ‘접수 상태’를 확인했다. 완료 화면의 파일 입력은 사라졌고 가로 넘침은 없었다. [모바일 완료 화면](screenshots/submission-mobile.jpg).
- 본인에게 없는 올바른 형식의 코드에서는 열린 코드 입력·내 제출 기록 찾기·새 경기 제출 링크가 우선 표시됐다. 새 접수 입력과 혼동되지 않았으며 ‘새 경기 결과 제출’을 누르면 빈 필수 입력 화면으로 이동했다.
- 320×740에서 native summary에 Enter로 추가 정보를 펼쳤다. 포커스 표시와 입력을 확인했고 가로 넘침이 없었다. [320px 전체 화면](screenshots/submission-new-320.jpg)은 스크롤 후 full-page 캡처라 고정 헤더/하단 메뉴가 캡처 중간에 보인다. 이를 실제 문서 배치 오류로 해석하지 않는다.
- 잘못된 접수 코드·없는 플레이어·없는 경기·없는 root URL의 hydration 후 최종 DOM에서 공개 header/main/footer가 각각 하나였다. 합성 ADMIN 로그인 후 없는 관리자 경기에서는 public shell/footer 없이 main 하나와 관리 홈·검색 복구 링크가 나타났다. [5개 경계의 DOM 결과](browser-boundaries.json).
- AX는 native summary를 button으로 표시하지만 DOM 역할은 generic이어서 처음 button locator가 일치하지 않았다. 실제 summary의 Enter 조작으로 검증했다. 이 도구 selector 차이를 제품 실패나 생략된 성공으로 처리하지 않았다.
- 전체 DB harness는 이후 `stop`으로 종료했고 exit 0, `cluster stopped and disposable workspace path removed`를 확인했다. [종료를 포함한 격리 로그](database-final.log)에 계정 비밀번호·fixture 식별자 출력을 제외하고 보존했다.

## 운영 반영 후 확인

`https://k-lol-gg.vercel.app`에서 익명·읽기 전용으로 확인했다. 운영 회원의 신청·경기·계정을 변경하지 않았다.

- 320×740, 390×844, 768×1024, 1280×900에서 홈에 가로 넘침이 없었다. 여섯 영역의 순서는 요구와 같고, 랭킹 세 선택 버튼은 모두 최소 높이 44px이었다. [측정 결과](browser-home-layouts.json).
- ‘최다 MVP’ 클릭 → 해당 슬라이드, ArrowLeft → 최다 참여, 자동 넘김 시작 → 승률 Enter 선택 후 자동 넘김 정지를 확인했다. Tab은 다음 종류 버튼으로 이동했고 Space로 최다 참여를 선택했다. 현재 선택은 하나였다.
- 390px의 실제 화면에서 세 버튼의 글자·선택색·순위 카드·기존 생성 아이콘과 배경의 가독성을 확인했다. 배포 전 소스/생성 CSS와 단위 회귀의 reduced-motion 확인은 유지되지만 OS 모션 감소 설정을 실제 전환했다고 기록하지 않는다.
- `/matches/submit?code=invalid`에서 단일 header/main/footer와 복구 안내를 확인하고 ‘홈으로 돌아가기’로 복귀했다. [운영 최종 DOM](browser-production-boundary.json).
- [운영 홈 화면](screenshots/production-home.jpg)은 공개 회원명이 포함되지 않도록 상단 문맥만 캡처했다. 캡처는 실제 배포 화면이며 디자인 목업이 아니다. 테스트 viewport override는 끝에 reset했다.

네이티브 취소 확인창의 도구 제한은 1.0.2 기록에 그대로 남긴다. 취소 HTTP 계약은 통과했지만 이 기록에서 브라우저 취소 성공으로 바꾸지 않는다. 운영 쓰기 과업은 격리 검증으로 대신했으며, 실제 외부 계정/장치가 필요한 범위는 production 기록을 따른다.
