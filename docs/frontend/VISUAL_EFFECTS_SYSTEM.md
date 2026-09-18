# K-LOL.GG 시각 효과 시스템

## 목표

기존의 밝은 sky·lilac·peach 색상과 짙은 navy 타이포를 유지하면서, 기능 중요도에 맞는 깊이·빛·움직임을 더한다. 효과는 정보를 강조하는 수단이며 기능, 읽기, 입력보다 앞서지 않는다.

## 효과 강도

| 등급 | 적용 대상 | 허용 효과 |
| --- | --- | --- |
| Signature | 홈 히어로, 우승, 랭킹 1위, 팀 결과 | 오로라 글로우, 프리즘 하이라이트, 1회 reveal |
| Feature | 구인 카드, 경기 카드, 대회, 미디어 | 상태 스트라이프, surface depth, fine-pointer hover lift |
| Utility | 검색, 필터, 입력, 일반 버튼 | focus ring, border·shadow 전환, 저장 상태 피드백 |
| Operational | 관리자 표·폼·위험 작업 | 선택·성공·경고·실패의 짧은 상태 피드백만 허용 |

## 모션 계약

- 빠른 상태 전환: 140–180ms
- 일반 reveal: 180–240ms, 이동 6–10px 이내
- 히어로 첫 등장: 최대 700ms
- hover lift: 최대 `translateY(-3px)`
- 무한 파티클, 자동 회전 캐러셀, 숫자 카운트업, 모바일 패럴랙스는 사용하지 않는다.
- 애니메이션은 주로 `transform`과 `opacity`를 사용한다.
- `prefers-reduced-motion: reduce`에서는 정보가 즉시 표시되고 모든 장식 모션을 제거한다.
- hover 효과는 `@media (hover: hover) and (pointer: fine)`에서만 실행한다.

## 성능·접근성 한도

- LCP 2.5초 이하, CLS 0.1 이하
- 전송량 2MiB 이하, JavaScript 700KiB 이하, 요청 75개 이하
- 새 영상·폰트·캔버스·파티클·애니메이션 라이브러리를 추가하지 않는다.
- 색상만으로 상태를 나타내지 않고 텍스트·아이콘·위치를 함께 사용한다.
- 터치 대상은 최소 44px, 키보드 focus는 hover와 동등하게 보이게 한다.
- 모바일에서는 큰 blur와 backdrop-filter를 줄인다.
- Windows forced-colors와 200% 확대에서도 정보와 작업 순서를 유지한다.

## 적용 순서

1. 전역 surface·shadow·glow·motion 토큰
2. 홈과 공통 내비게이션의 Signature 효과
3. 구인·경기·랭킹·팀 밸런스의 Feature 효과
4. 대회·미디어의 콘텐츠 효과
5. 계정·관리자의 가독성과 Operational 피드백
6. 105페이지·339캡처, 접근성·성능, 기능 회귀 재검증
