# K-LOL.GG Discord 운영 자동화 1차 적용 안내

## 추가된 기능

1. Discord 로그인/회원가입 시작 API
- `/api/auth/discord/start`

2. Discord OAuth callback
- `/api/auth/discord/callback`

3. Discord 닉네임 파싱
- 예: `98 영훈 탑갱와줘요오 U(G)`
- 년도/이름/닉네임/티어를 분리하여 UserAccount에 저장

4. Discord 음성 이벤트 저장 API
- `POST /api/discord/voice-state`

5. 진행중 구인 자동 ㅉ 판단 API
- `POST /api/discord/recruits/auto-finish/check`
- 참가자 전원이 감시 대상 음성방에서 빠진 상태가 일정 시간 유지되면 자동 마감

6. 운영진 전용 모니터 페이지
- `/admin/discord-monitor`

## 필요한 환경변수

```env
NEXT_PUBLIC_BASE_URL="https://k-lol-gg.vercel.app"
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
DISCORD_REDIRECT_URI="https://k-lol-gg.vercel.app/api/auth/discord/callback"
DISCORD_BOT_TOKEN=""
DISCORD_BOT_API_SECRET=""
DISCORD_AUTO_FINISH_HOLD_MINUTES="10"
```

## Discord 봇 서버가 호출할 API 예시

### 음성 입퇴장 저장

```http
POST /api/discord/voice-state
x-discord-bot-secret: <DISCORD_BOT_API_SECRET>
Content-Type: application/json

{
  "discordId": "1234567890",
  "eventType": "JOIN",
  "channelId": "9876543210"
}
```

### 자동 ㅉ 검사

```http
POST /api/discord/recruits/auto-finish/check
x-discord-bot-secret: <DISCORD_BOT_API_SECRET>
Content-Type: application/json

{
  "channelId": "9876543210",
  "currentDiscordIds": ["111", "222"],
  "holdMinutes": 10
}
```

응답의 `kakaoReply`가 비어있지 않으면 카카오봇 또는 운영봇이 카톡에 출력하면 된다.

## 자동 마감 기준

- 구인 상태가 `IN_PROGRESS`
- 구인 참가자와 연결된 Discord ID가 있음
- 참가자 전원이 현재 음성방에 없음
- 위 상태가 `DISCORD_AUTO_FINISH_HOLD_MINUTES`분 이상 유지됨
- 자동으로 `FINISHED` 처리

## 공개 정책

- 유저 화면: 모집중/진행중/완료 상태만 표시
- 운영진 화면: 참가자 잔류 수, 비참가자 수, 자동 마감 후보 상태 확인
