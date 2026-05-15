# Kakao Recruit Time Metadata Patch

## 적용 규칙

- 솔랭 구인만 저장/출력
  - 시간
  - 티어
  - 즐겜/빡겜
  - 선호라인

- 솔랭 외 구인 저장/출력
  - 시간만

- 대상
  - 자랭
  - 일반
  - 칼바람/증바람
  - 롤체 일반
  - 롤체 랭크
  - 더블업
  - 기타게임

## 적용 후 실행

```powershell
cd E:\k-LOL.GG\K_LOL_GG_ver2\k_lol_gg

npx prisma generate
npx prisma migrate deploy
npm run lint
npm run build
```

## Git 반영

```powershell
git add .
git commit -m "fix kakao recruit solo metadata only"
git push origin main
```


## 슬래시 명령어 지원

아래 명령어는 앞에 `/`를 붙여도 동일하게 동작합니다.

```text
/솔랭구인
/자랭구인
/일반구인
/칼바람구인
/증바람구인
/롤체일반구인
/롤체랭크구인
/더블업구인
/구인현황
/12 쫑
/구인마감 #12
```
