# NEXUS Kakao / Riot / HTTP 경계 감사

2026-10-27 18:57–19:00 KST에 `https://nexus-gg-kr.vercel.app`을 확인했다. 이 범위에서 차단 실패나 서비스 간 설정 혼용 회귀는 발견하지 못했다. 소스 수정, 운영 사업 데이터 쓰기, 실제 카카오 메시지 발송, 브라우저 조작은 수행하지 않았다.

## 검증 결과

| 검사 | 결과 | 근거 |
| --- | --- | --- |
| 서비스·DB·세션·카카오·Riot 로컬 계약 | 115/115 통과, skip 0 | `integrations-local-tests.json` |
| 공개 API·관리자 비인증·입력 경계 HTTP | 29/29 기대 응답 | `integrations-http-audit.json` |
| 서명된 카카오 전용 진단 | RECRUIT / FEATURES의 `V4상태`, `도움말` 4건 HTTP 200, NEXUS 응답 | `integrations-signed-diagnostics.json` |
| Vercel production 환경 metadata | NEXUS DB·카카오·인증 설정 존재, 일반 DATABASE_URL 없음 | `integrations-environment-audit.json` |
| Riot 사이트 인증 파일 | `/riot.txt` HTTP 200, 로컬 공개 파일과 일치 | `integrations-http-audit.json` |

카카오 진단은 `src/modules/recruiting/kakao-v4/application.ts:35`의 localReply에서 처리되는 읽기 전용 명령만 사용했다. 실제 bot/카카오방에 메시지를 발송하지 않았고 모집·신청·결과·알림 데이터를 생성하지 않았다. 서버 로그와 메모리 진단 receipt는 발생할 수 있다. site-notice REGISTER/POLL/ACK는 호출하지 않았다.

관리자 API 10곳 및 사용자 Riot API는 쿠키 없이 401을 반환했다. `/admin`, `/admin/users`는 같은 NEXUS origin의 관리자 로그인으로 307을 반환했다. 서명 없는 카카오 진단은 401, query/room identity header는 400, 잘못된 companion 요청은 400이었다. GET RSO start는 POST 전용 경로이므로 405가 정상이며 POST 무인증 요청은 401이었다. 처음 GET 기대값을 401/403으로 둔 감사 사례 오류는 원본 소스를 확인하여 정정했고 JSON에 남겼다.

## 서비스 분리

- DB: `src/platform/db/runtime-database-url.ts:16`에서 NEXUS는 NEXUS_DATABASE_URL만 선택한다. 같은 DB의 direct/pooler URL을 포함한 동일 대상 거부와 fallback 금지를 계약 테스트로 확인했다. Vercel 현재 metadata에도 DATABASE_URL이 없고 NEXUS_DATABASE_URL이 있다.
- 인증: `src/modules/auth/infrastructure/session-constants.ts:3`의 쿠키 이름과 `jose-session-codec.ts:35`의 issuer/audience가 분리된다. 키를 실수로 재사용하는 합성 사례에서도 다른 서비스 세션을 거부하는 테스트가 통과했다.
- 폰: `integrations/messengerbot-r/nexus/NEXUS_KAKAO_BOT_MESSENGERBOT_R.js:1` 및 companion 첫 줄의 NEXUS_DB가 모든 폰 설정·상태 키에 NEXUS 접두어를 적용한다. 공유 DataBase VM에서 설정/중복 방지 상태/endpoint/링크/identity/요청 ID 분리와 미설정 무요청을 검사했다.
- 방: 일반 봇 1736행과 companion 195행은 정확한 `NEXUS`, `NEXUS 구인구직방` 및 카카오 package만 허용한다. 기존 K-LOL 봇에서도 NEXUS 두 방을 구독 대상에서 제외해야 한다. 방 표시 이름은 인증 수단이 아니며 같은 이름의 다른 방은 구독 설정으로 제한해야 한다.

Vercel 환경변수는 key/target/type 존재 metadata만 읽었고 decrypt/pull하지 않았다. 로컬 production.env의 플래그·별칭 일치와 현재 Vercel metadata를 구분해 기록했다. 두 운영 서비스의 실제 secret 값을 서로 비교하지 않았으며 기존 K-LOL 운영 자원에 요청하지 않았다. 현재 NEXUS 서명 진단 성공은 배포 서버와 NEXUS private 설치본 설정의 호환 근거다.

## 아직 완료로 볼 수 없는 항목

1. **휴대폰 실제 설치·양쪽 방 검증**: 설치 metadata는 PENDING_USER_INSTALL이다. private main/companion 파일은 저장된 해시와 일치하며 CRLF 각각 64,797 / 13,717자로 65,535자 제한 안이다. 원격 DB의 site-notice 0건, 현재 site-notice nonce binding 0건은 설치 완료 근거가 아니다. nonce가 만료될 수 있으므로 과거 미설치의 확정 근거도 아니다.
2. **companion 수신 등록**: 코드 79–80행에서 활성화 flag와 실제 replier session이 모두 있어야 poll한다. 서버 설정 ON만으로 폰 수신은 시작되지 않는다. 사용자가 별도 NEXUSNotice 봇을 설치하고 한 대상 방에서 private 등록 명령을 전송한 뒤 수신을 확인해야 한다.
3. **Riot 연동**: 현재 Vercel production metadata에 RIOT_API_KEY, RIOT_ENCRYPTION_KEYS, 라우팅 및 RSO 설정이 없다. 공개 site-settings와 DB 읽기 결과는 riotIntegration=false다. 로컬 staged env도 false이며 fake runtime=false다. 사이트 인증 파일은 정상이나 운영 API/RSO 활성화 완료 상태가 아니다.
4. **Riot 승인 상태**: 통합 감사 담당자는 17:21 KST 저장된 포털 증거를 읽었고, 이후 root 담당자가 19:05:28 KST 인증된 Riot 포털에서 NEXUS.GG 신청 898158의 **Pending Review**를 직접 재확인했다. 최신 근거는 `riot-portal-status.json`이며 읽기만 수행했다. 사이트 코드 검증 성공 기록과 `/riot.txt` 정상 상태는 승인 완료를 뜻하지 않는다. 기존 16:45 provider 401 기록은 과거 다른 키 검사이며 현재 NEXUS 키의 검증 결과로 사용하지 않았다. 키를 발급·재사용하거나 외부 Riot API를 호출하지 않았고 연동 OFF 상태가 유지된다.

DB 담당자의 명시적 READ ONLY 조회에서 brand=NEXUS.GG, riotIntegration=false, Kakao 기능 flags 모두 true, maintenance_mode=false를 확인했다. 이는 공개 설정/서명 진단과 일치한다. 전체 시스템 QA, 실제 폰 송수신, 데이터 작성 경로, 브라우저 검증의 대체 근거로 사용하지 않는다.
