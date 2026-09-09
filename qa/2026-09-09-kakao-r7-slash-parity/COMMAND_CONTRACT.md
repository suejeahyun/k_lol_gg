# 명령 계약 집계

원본: `integrations/messengerbot-r/command-parity-contract.json`

| 영역 | 명령/별칭 수 |
| --- | ---: |
| CORE | 20 |
| PARTY | 33 |
| INHOUSE | 13 |
| SCRIM | 21 |
| MANAGED | 13 |
| 합계 | 100 |

실행: `npm run bot:kakao:audit`

각 sample에 대해 `sample`, `/sample`, `／sample` canonical parity를 자동 검사한다. V1 호환 영역은 parser 분류 결과까지 deep-equal로 비교한다.
