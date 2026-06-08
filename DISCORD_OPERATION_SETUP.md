# K-LOL.GG Discord 운영 자동화 통합 패치 적용 안내

## 포함 기능

- Discord 로그인 / 회원가입
- 기존 UserAccount ↔ Discord 계정 연결 기반
- Discord 닉네임 파싱 유틸
- Discord 음성방 JOIN / MOVE / LEAVE 이벤트 저장
- 진행중 구인의 참가자 전원 퇴장 감지
- 참가자 전원 퇴장 상태가 일정 시간 유지되면 자동 ㅉ 처리
- 운영진 전용 Discord 모니터 페이지
- 운영진 Discord 로그 채널 출력용 봇 샘플

## 유저 공개 / 운영진 공개 기준

유저에게 공개:
- 구인 상태: 모집중 / 진행중 / 완료
- 내전 통계, 참가 횟수, 활동량, 배지 등

운영진만 확인:
- 음성방 입장 / 이동 / 퇴장 로그
- 자동 ㅉ 판단 사유
- 비참가자 음성방 인원
- 미연동/오류/스킵 사유
- 자동 마감 후보 상태

## 중요한 제한

카카오톡봇은 일반적으로 서버에서 임의 시점에 먼저 메시지를 보내는 구조가 아니다.
따라서 이 패치의 자동 ㅉ은 사이트 DB와 구인현황을 자동으로 정리하고, 디스코드 운영진 로그 채널에 안내한다.
카카오톡 안내 문구는 API 응답의 `kakaoReply`로 생성된다.
현재 카카오봇 구조에서 완전한 실시간 카톡 선제 발송을 하려면 카카오봇 쪽에 별도 타이머/폴링 로직이 추가로 필요하다.

## 적용 방법

1. zip 압축을 프로젝트 루트에 덮어쓰기

프로젝트 루트:

```powershell
E:\k-LOL.GG\k_lol_gg
```

2. 패키지 / Prisma / 빌드

```powershell
cd E:\k-LOL.GG\k_lol_gg
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
```

3. 로컬 실행

```powershell
npm run dev
```

## 사이트 환경변수

로컬 `.env.local` 및 Vercel Environment Variables에 추가한다.

```env
DISCORD_CLIENT_ID=애플리케이션_ID
DISCORD_CLIENT_SECRET=클라이언트_시크릿
DISCORD_PUBLIC_KEY=퍼블릭_키
DISCORD_BOT_TOKEN=봇_토큰
DISCORD_GUILD_ID=서버_ID
DISCORD_BOT_API_SECRET=사이트와_봇이_같이_쓸_긴_랜덤값
NEXT_PUBLIC_BASE_URL=https://k-lol-gg.vercel.app
```

로컬 테스트 중이면:

```env
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

## Discord Developer Portal Redirect URI

OAuth2 → General → Redirects에 둘 다 등록한다.

```text
http://localhost:3000/api/auth/discord/callback
https://k-lol-gg.vercel.app/api/auth/discord/callback
```

## Discord 봇 서버 실행

1. 봇 샘플 폴더 이동

```powershell
cd E:\k-LOL.GG\k_lol_gg\discord-bot-sample
```

2. 설치

```powershell
npm init -y
npm i discord.js dotenv
```

3. `discord-bot-sample\.env` 생성

```env
DISCORD_BOT_TOKEN=봇_토큰
DISCORD_BOT_API_SECRET=사이트와_같은_SECRET
KLOL_BASE_URL=https://k-lol-gg.vercel.app
DISCORD_WATCH_CHANNEL_IDS=감시할음성방ID1,감시할음성방ID2,감시할음성방ID3
DISCORD_ADMIN_LOG_CHANNEL_ID=운영진로그텍스트채널ID
DISCORD_CHECK_INTERVAL_MS=60000
DISCORD_AUTO_FINISH_HOLD_MINUTES=10
DISCORD_LOG_VOICE_EVENTS=false
```

4. 실행

```powershell
node discord-auto-finish-bot.js
```

정상 로그:

```text
[K-LOL.GG Discord Bot] logged in as K-LOL.GG#1913
```

## 확인 SQL

음성 이벤트:

```sql
SELECT *
FROM "DiscordVoiceEvent"
ORDER BY "occurredAt" DESC
LIMIT 20;
```

자동 마감 모니터:

```sql
SELECT *
FROM "RecruitPartyDiscordMonitor"
ORDER BY "updatedAt" DESC
LIMIT 20;
```

구인 자동 마감 로그:

```sql
SELECT *
FROM "RecruitPartyLog"
WHERE action = 'DISCORD_AUTO_FINISHED'
ORDER BY "createdAt" DESC
LIMIT 20;
```

## 운영진 페이지

```text
/admin/discord-monitor
```

확인 항목:

- 진행중 구인 자동 마감 상태
- 최근 디스코드 모니터 기록
- 최근 음성 이벤트

## 자동 ㅉ 작동 조건

- 구인 상태가 `IN_PROGRESS`
- 구인 참가자 전원이 Discord 계정과 연결되어 있음
- 해당 파티 참가자들이 감시 음성방에서 실제 활동한 기록이 있음
- 참가자 전원이 해당 음성방에서 퇴장함
- 퇴장 상태가 `DISCORD_AUTO_FINISH_HOLD_MINUTES`분 유지됨
- 조건 충족 시 구인 상태가 `FINISHED`로 변경됨

## 안전장치

- 감시 대상 여러 음성방 중 빈 방 때문에 잘못 마감되는 것을 막기 위해, 해당 음성방에서 참가자 활동 이력이 없으면 자동 마감 후보로 보지 않는다.
- 디스코드 미연동 참가자가 있으면 자동 마감하지 않는다.
- 비참가자/구경 인원은 자동 마감 판단에서 제외한다.
- 유저에게 개인 입퇴장 로그를 공개하지 않는다.
