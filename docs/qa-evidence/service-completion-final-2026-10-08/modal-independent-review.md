# 모달 공통 원인 대조와 독립 읽기 검토

검토자는 `release_inventory`다. 갤러리 변경은 이 검토자가 구현했으므로 자체 검증이며, MMR/Riot는 다른 담당자가 구현한 변경을 독립 읽기로 검토했다. 갤러리의 별도 독립 검토는 `security_data_audit`가 수행했다. 이 후속 검토에서는 제품 파일·DB·브라우저·서버를 변경하거나 broad test를 다시 실행하지 않았다.

## 같은 선언을 쓰는 화면 대조

현재 `src`의 `aria-modal` 사용처를 모두 확인했다. 공통 원인은 `aria-modal=true` 선언이 실제 키보드 동작을 제공한다고 가정한 것이다. 아래 결함을 새로운 API나 공통 대화상자 프레임워크 없이 해당 화면의 기존 구조 안에서 보완했다.

| 화면 | 확인된 수정 전 상태 | 수정/유지 판단과 근거 |
| --- | --- | --- |
| MMR 전체 원장 재계산 확인 | 실제 운영 UI에서 Escape 무반응, Tab 배경 이탈, 취소 후 초점 손실. 재계산 요청은 이 재현에서 실행하지 않음 | 취소 초기 초점·Tab 경계·Escape·trigger/fallback 복원·본문 스크롤 복원·즉시 ref의 배경 submit 잠금. 기존 frozen 요청/멱등 키/정확한 successor generation/성공 후 refresh 잠금은 유지 |
| Riot 선택 일괄 동기화 확인 | 기존 취소 초기 초점은 정상. Tab 이탈·닫은 뒤 초점 손실. 별도 실제 운영 확인창 재현과 독립 handler 결과가 일치 | 같은 키보드 복원과 form inert, 같은 tick 배경 요청 차단, 확인 대상 고정. 기존 bulk API/역할 경계는 유지 |
| Riot ID 일괄 연결 확인 | Tab 이탈·초점 복원 없음. 처리 중 취소는 비활성이나 Escape는 닫힘. 실패 메시지가 모달 밖에만 있었음 | 요청 중 dialog에 초점, Tab/Escape 보호, 오류를 내부 alert로 표시·취소로 복귀. 성공 집계·취소/실패 회복 유지. 기존 Promise와 외부 결과가 살아 있어 원본을 데이터 유실로 과장하지 않음 |
| 공개 멸망전 갤러리 확대 | 서버 aside의 modal 선언과 닫기 링크뿐. 초기 초점·Tab·Escape·복원 없음 | 최소 client 경계와 native showModal, 같은 이미지/URL/이력 정책. [수정·8 focused PASS](gallery-modal-recovery.md). 이는 자체 검사이며 별도 security 담당의 독립 읽기에서 blocker 없음 |
| 경기 접수 거절·경기 무효화 | 이미 초점·Tab·Escape·복원 handler가 있는 기존 패턴 | 정상 패턴으로 대조하고 수정하지 않음. 이번 읽기 검토로 새 브라우저 통과를 주장하지 않음 |
| AI 도우미 | `aria-modal=false`, 열면 input 초점·닫으면 trigger 복원 | 배경 사용과 Tab 이동이 허용된 비모달의 의도와 맞아 모달 trap을 넣지 않음. 기존 닫기 동작으로 복구 가능하며 새 과업 방해 근거 없음 |

기존 native `confirm`은 이 ARIA 모달 변경 대상이 아니며 이번 수정으로 전환하거나 제거하지 않았다.

## Riot/MMR 독립 검토 결론

추가 배포 차단 finding은 발견하지 않았다. Riot의 즉시 `modalOpen`/`sending` ref가 선택·배경 요청·중복 확인을 막고, 순환 대상은 현재 enabled 버튼이며 처리 중 모두 disabled일 때 dialog 초점을 유지한다. 성공 시 집계 후 닫힘과 trigger/fallback 복원이 연결된다. 최초 취소 autoFocus가 원래 정상이라는 구분도 문서·수정과 일치한다.

MMR 확인창의 cancel/Escape는 API를 호출하지 않고 background adjustment submit을 즉시 차단한다. 확인 후 기존 command로 넘기는 구조와 세션/412 복구, 동일 payload·revision 재확인, 성공 generation의 정확한 +1 검사, 오래된 화면에서 추가 mutation을 막는 refresh 경계를 보존했다. 확인 모달 변경이 MMR 계산·원장·권한·receipt 계약을 바꾸지 않는다.

독립 Riot 원본 실제 TSX 실행 [3 FAIL](riot-modal-independent-before.log)은 두 Tab 경계와 pending Escape를 확인한 수정 전 증거다. 이후 useEffect/ref가 추가됐으므로 이 옛 대역을 그대로 재실행하지 않았다. 담당자의 보완된 실제 handler [4 FAIL](riot-modal-focused-before.log) → [19 focused PASS](riot-modal-focused-after.log), [상세 범위](riot-modal-recovery.md)를 대조했다. MMR은 [수정 전 focused](mmr-modal-focused-before.log)와 [수정 후 17 focused PASS](mmr-modal-focused-after.log), 실제 운영 재현을 기록한 [진행 문서](remaining-ui-plan.md)를 대조했다. 환경 대역 오류 기록은 제품 실패와 분리되어 있다.

여기서 읽은 handler 검증은 React/DOM/HTTP 대역을 포함한다. 실제 최적화 서버의 키보드 조작, native dialog top layer, 브라우저 뒤로 가기, 모바일 실기기와 운영 제공자 호출을 이 문서만으로 PASS 처리하지 않는다. root의 통합·실제 UI·배포 기록을 별도로 따른다. 운영 MMR 전환 및 자연 cron 결과는 [별도 운영 검증](mmr-post-transition-operating.md)에 있으며 이 모달 검토에서 운영 쓰기를 실행하지 않았다.
