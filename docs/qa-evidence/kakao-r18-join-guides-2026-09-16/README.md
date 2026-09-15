# 카카오 R18 신규 입장 안내 QA

검토일: 2026-09-16 KST

대상: MessengerBot R 신규 입장 로컬 안내, V1 strict 회귀, 공개·비공개 전체 복붙 설치본

판정: 소스 구현, 집중 자동 검증, 전체 앱 검사, 프로덕션 빌드와 Vercel 운영 배포를 통과했다. 휴대폰 실기기 설치와 실제 카카오톡 신규 입장 수신은 사용자 설치 후 확인 대상이다.

## 확정 동작

1. `들어왔습니다` 입장 문구를 받으면 닉네임 안내, 구인구직방 안내, 디스코드 링크를 이 순서로 각각 전송한다.
2. 입장 안내는 HTTP 요청 없이 휴대폰 로컬에서 처리한다.
3. 퇴장·초대·일반 대화는 기존 무응답을 유지한다.
4. frozen V1 fixture는 수정하지 않고 strict wrapper의 승인된 확장으로만 적용했다.
5. 불안정했던 방 이름 parser를 실행 조건으로 사용하지 않아, 이 봇 프로필이 구독한 방에 공통 적용된다.

## 생성물

| 파일 | LF 문자 | CRLF 문자 | SHA-256 | Rhino 경고 후보 | 혼합 return | 주석 | 버전 선언 | response 함수 |
| --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |
| 공개 검토본 `KLOL_KAKAO_BOT_V1_STRICT_MESSENGERBOT_R.js` | 63,476 | 65,285 | `ea71eb7fb533e812d265969f989a72be83a1e552b164576251dd3c7f1f7963bb` | 0 | 0 | 0 | 1 | 1 |
| private 전체 복붙 파일 | 61,690 | 63,496 | `cb4ff5b4cc151b67a96198e41ca127ccf02daf818155f3263d5f9479ce2a6c52` | 0 | 0 | 0 | 1 | 1 |

두 파일 모두 MessengerBot R CRLF 65,535자 제한 이내다. private 설정값은 보존했으며 문서나 Git에 노출하지 않는다.

## 집중 검증 결과

```text
node --test tests/kakao-v1-strict-messengerbot.test.mjs tests/kakao-v4-v1-compatibility-contract.test.mjs tests/kakao-v1-exact-v4-adapter-architecture.test.mjs
PASS — 46/46

node scripts/audit-messengerbot-rhino-static.mjs <public>
node scripts/audit-messengerbot-rhino-static.mjs <private>
PASS — ES5, warning candidate 0, mixed return 0

npm run check
PASS — lint 오류 0, 타입 검사, 일반 테스트 779 PASS·1 intentional skip,
       ERD 102 tables/165 FK, 홈 여성 챔피언 가이드 68장, 프로덕션 빌드 93 pages
```

## 운영 반영 상태와 남은 확인

- 기능 커밋: `1fc6e5fc63d429d82b05acc2cddc29efbd58dffa`
- 릴리스 tag: `kakao-r18-join-guides-v1.0.0`
- Vercel 운영 배포: `dpl_H9LFWVMfxLYe3FBts2uKqzWAER6C` · Ready · Production · Latest
- 운영 URL: `https://k-lol-5tqmcg82l-tjdmswo11-3715s-projects.vercel.app`
- 운영 별칭: `https://k-lol-gg.vercel.app`
- 운영 검증: 2026-09-15T20:08:15.960Z · `/api/health` HTTP 200 · `status: ready`
- 휴대폰 버전: `KLOL_KAKAO_BOT_V40_R18_2026_09_16`
- DB migration·운영 데이터 직접 변경·삭제: 없음
- 외부 확인: 실제 휴대폰 전체 교체·컴파일, `/봇버전`, 실제 신규 입장 시 세 안내 순서와 중복 여부

## 다음 패치 추천

1. 실기기 입장 이벤트 원문을 개인정보 제거 fixture로 추가한다.
2. 방 이름 parser가 안정화되면 고객센터 전용 안내와 구인방용 안내를 분리한다.
3. 동일 `logId` 입장 알림 중복 억제 여부를 실기기 로그로 판단한다.
4. 공개 설치본의 CRLF 여유가 작으므로 다음 기능 전에 생성물 압축 정책을 개선한다.
