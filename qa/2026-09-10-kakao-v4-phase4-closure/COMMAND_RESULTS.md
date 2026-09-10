# 검증 결과

## 호환성 및 회귀

| 검증 | 통과 | 실패 | 결과 |
| --- | ---: | ---: | --- |
| V1/V40/V41 + V4 `.mjs` 계약 회귀 | 145 | 0 | PASS |
| V4 전체 `.ts` 서버 회귀 | 95 | 0 | PASS |
| Phase 4 client + artifact 최종 | 11 | 0 | PASS |
| Phase 4 server 최종 | 5 | 0 | PASS |
| 저장소 전체 `test:contracts` | 281 | 0 | PASS |
| 저장소 전체 `test:unit` | 593 | 0 | PASS |

## 정적·빌드

| 명령 | 결과 |
| --- | --- |
| `npm run bot:kakao:v4` | PASS, ES5 생성본 2개 갱신 |
| `npm run typecheck` | PASS |
| `npm run lint -- --quiet` | PASS, 오류·경고 0건 |
| `npm run build` | PASS, V4 API route 포함·정적 페이지 92개 |
| `git diff --check` | PASS |

## 계약 증거

- fixture의 모든 PUBLIC alias: 올바른 V4 profile에서 0/1 slash 모두 허용.
- 실제 V41 공개 sample: 전부 휴대폰 allowlist 통과 및 서버 local/canonical 경로 보유.
- 내부 V2, unknown, malformed: 휴대폰 전송 0회.
- 서버 직접 호출의 내부/unknown 입력: HTTP 400 `INVALID_FORM`.
- V4 application/http/route: `NOT_IMPLEMENTED`, `ROUTER_NOT_ENABLED`, `status: 501` 없음.
- `사진상태`, `내전확인`, `내전미리보기취소`: 휴대폰 서버 전송 0회.

## 생성본 SHA-256

```text
73966c245af9f32fbdc9851ce0ace44ec778b72a5504c8842f30a7b63db8df20  integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_RECRUIT_MESSENGERBOT_R.js
17dc3342970de37385bc5d582894bffcdd79cc16de415e49d69627f02ca7abf4  integrations/messengerbot-r/v4/KLOL_KAKAO_BOT_V4_FEATURES_MESSENGERBOT_R.js
```

## 비실행 항목

- 실기기 설치/컴파일/카카오 callback
- 운영 배포 및 운영 DB/secret 변경
- 실제 사이트 로그인과 사진 업로드
