# K-LOL.GG 커뮤니티 / 공지사항 / 이벤트공지 기능 삭제 패치

## 목적

Git push 전 상태로 복구한 뒤, 운영 기능 중 다음 기능만 완전히 삭제합니다.

- 커뮤니티
- 사이트 공지사항
- 이벤트공지

## 유지 대상

- 이벤트 내전
- 멸망전
- 구인
- 플레이어
- 랭킹
- 내전
- Discord
- Kakao
- JWT
- 2FA
- HMAC
- Security Middleware

## DB 삭제 대상

- Notice
- EventNotice
- CommunityHeadline
- CommunityPost
- CommunityComment
- CommunityLike
- CommunityReport
- CommunityVisit
- MatchMvpVote

## 적용 후 필요 명령

```powershell
npx prisma migrate deploy
npx prisma generate
npm run build
npm run dev
```
