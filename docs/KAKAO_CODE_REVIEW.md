# K-LOL.GG 카카오톡 관련 코드 점검 결과

## 점검 범위

- `src/app/api/kakao/openchat/route.ts`
- `src/app/api/kakao/scheduled-notice/route.ts`
- `src/app/api/kakao/party-recruits/**`
- `src/app/api/kakao/recruit/season-apply/**`
- `src/lib/kakao/**`

## 수정 요약

1. 카카오봇 응답 HTTP 상태 통일
   - Jsoup 기반 카카오봇은 400/404/500 응답에서 `HttpStatusException`이 발생할 수 있음.
   - 카카오 API 계열 응답은 HTTP 200으로 반환하고, 실제 처리 상태는 JSON의 `ok`, `statusCode`로 구분하도록 통일.

2. 구인구직 양식 통일
   - 응답 헤더를 `[K-LOL.GG ...]` 형식으로 통일.
   - `K-LOL`과 `K-LOL.GG`가 섞여 있던 문구 정리.
   - 마무리 명령어 예시에서 `/12 쫑` 대신 `12 쫑`, `12 ㅉ` 기준으로 안내.

3. 구인구직 생성 파서 오류 수정
   - `parseCreateRecruitCommand` 내부 중괄호 오류를 정리.
   - `롤체일반구인`, `롤체랭크구인`, `더블업구인`, `기타게임구인` 분기를 안정화.
   - `롤체랭크구인` 최대 인원은 3명 유지.

4. 모집번호 없는 구인글 반영 차단 강화
   - `sync` API에서 모집번호 0 또는 누락된 글이 반영되지 않도록 검증을 `1~99`로 수정.
   - 실패 안내에 “모집번호가 없는 구인글은 반영하지 않습니다.” 문구 추가.

5. 도움말 양식 통일
   - LOL - K방 명령어와 구인구직방 명령어를 분리해서 출력.
   - `/` 없는 명령어 사용 기준으로 정리.

## 권장 카카오봇 방 분리 기준

### LOL - K방

- `도움말`
- `전적 닉네임#태그`
- `최근 닉네임#태그`
- `랭킹`
- `내전현황`
- `내전참가`

### 구인구직방

- `자랭구인`, `일반구인`, `솔랭구인`
- `칼바람구인`, `증바람구인`
- `롤체일반구인`, `롤체랭크구인`, `더블업구인`
- `구인현황`
- `12 쫑`, `12 ㅉ`
- 모집번호가 포함된 구인글 본문
- 협곡내전 참가 신청 양식

## 배포 전 확인 명령어

```powershell
cd E:\k-LOL.GG\K_LOL_GG_ver2\k_lol_gg
npm run lint
npm run build
```

## 카카오 API 테스트 예시

```powershell
$base = "http://localhost:3000"

Invoke-RestMethod "$base/api/kakao/openchat?message=도움말"
Invoke-RestMethod "$base/api/kakao/openchat?message=전적 sax0ph0ne#99단굵묵"
Invoke-RestMethod "$base/api/kakao/party-recruits/status"

Invoke-RestMethod "$base/api/kakao/party-recruits/create" `
  -Method POST `
  -ContentType "application/json; charset=utf-8" `
  -Body '{"message":"자랭구인","room":"K롤방 구인구직방","sender":"관리자"}'
```
