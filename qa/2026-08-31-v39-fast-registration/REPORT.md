# K-LOL.GG V39 등록·인증 간편화 보고서

기준일: 2026-08-31 KST

## 결론

내전 결과 등록, 관리자 수기 등록, 경고 등록, 경고 차감 인증의 반복 단계를 줄였다. 일반 경고 10게임, 내전 경고 15게임, 관리자 최종 승인, 카카오 운영자·방·소유권 정책은 유지했다.

메신저봇R에서 기존 2020~2022행이 오류 위치로 표시된 제보에 따라, 실행 의미가 없는 영문 주석 세 줄을 제거하고 해당 JSON 조립 구간을 ES5 실행문만 남겼다. 전체 소스의 비표준 들여쓰기 공백과 혼합 개행도 일반 공백·CRLF로 통일한 R1 호환성 보정을 추가했다.

## 반영 내용

### 내전 결과·수기 등록

- `/결과등록 3세트 1회차 [밸런스#2] [메모:내용]` 빠른 접수
- 인자가 없는 `/내전등록` 양식에 KST 오늘 날짜와 카카오 진행자 자동 입력
- 관리자 수기 등록 화면에 접수 경로, 진행자, 회차, 시즌, 밸런스, 특이사항, 사진 OCR 상태 표시
- 접수 시즌과 같은 유효한 팀 밸런스가 연결되면 BLUE/RED 10명을 모든 세트에 자동 입력
- 저장된 비공개 결과 사진을 한 번의 버튼으로 순차 OCR 분석
- 자동 조건이 맞지 않거나 OCR 일부가 실패하면 기존 수동 입력·붙여넣기 경로 유지

### 경고 등록·인증

- `/경고 닉네임#태그 일반|내전 [사진0~3]` 빠른 접수
- 인자가 없는 `/경고` 양식에 KST 오늘 날짜와 사진 0장 자동 입력
- 관리자 직접 등록 화면에 일반 10판·내전 15판 프리셋 추가
- 직접 등록 및 카카오 접수 승인 직후 WR 코드, `/인증 WR...`, 사이트 링크를 계속 표시하고 복사 가능
- 사이트 경고 사진은 남은 수량 전체를 강제하지 않고 1장 이상 부분 저장 후 이어서 제출 가능
- `/인증`, `/경고현황`, `/결과현황`은 소유 후보가 정확히 한 건일 때만 접수번호 없이 자동 선택
- 후보가 없거나 여러 건이면 접수번호 또는 로그인 사이트를 요구하며 임의 선택하지 않음

## 권한·보안 보존

- 빠른 경고 접수는 서버에 등록된 카카오 운영자만 가능
- 빠른 명령도 기존 기능 스위치, 점검 모드, 허용 방, 발신자 정책을 통과해야 함
- 경고 사유는 공개 카카오방에 노출하지 않고 관리자 사이트에서만 입력
- 비공개 사진은 관리자 전용 자산 API와 기존 감사 로그 경로를 통해서만 OCR에 전달
- WR 자동 선택은 현재 방·발신자의 활성 세션 또는 표시 이름과 대상 정보가 정확히 일치하는 단일 과제로 제한
- 일반 10장·내전 15장 및 관리자 차감 승인은 변경하지 않음

## 핵심 파일

- `KLOL_KAKAO_BOT_V39_FAST_REGISTRATION.js`
- `src/app/api/kakao/managed-forms/route.ts`
- `src/lib/kakao/managed-quick-command.ts`
- `src/lib/kakao/managed-forms.ts`
- `src/app/(admin)/admin/matches/new/page.tsx`
- `src/features/match/MatchForm.impl.tsx`
- `src/components/admin/DisciplineRecordCreateClient.tsx`
- `src/components/admin/DisciplineWorkflowClient.tsx`
- `src/components/admin/DisciplineTaskHandoff.tsx`
- `src/app/(user)/discipline/evidence/DisciplineEvidenceSubmitClient.tsx`

## 검증 결과

- `npm run check`: PASS
  - 접근성, 내비게이션, 모바일 흐름, SEO
  - ESLint, TypeScript
  - Prisma schema validate
  - 관리자 API guard, 관리자 보안 정책, 기능 게이트, 요청 제한
  - 카카오 구인·인증·정책·세션·운영양식·통계·빠른 명령
  - 비공개 이미지, 웹 제출, 내전 자동 채움, 경고 부분 제출, 징계 정책
  - Next.js production build
- `npm run check:secrets`: PASS
- `git diff --check`: PASS
- 카카오봇 `node --check`: PASS

## 배포 상태

- 소스 반영: 완료
- 자동 검사: 완료
- 프로덕션 빌드: 완료
- 이번 릴리스에 필요한 DB 마이그레이션: 2건 적용 완료
  - `20260830103000_enforce_admin_totp_assurance`
  - `20260830153000_kakao_operation_form_idempotency`
- 런타임 커밋·푸시: 완료 (`f4e8d1f`)
- CI 보정 커밋·푸시: 완료 (`388ba1c`)
- GitHub Actions: 완료·성공
- Preview 배포: 미실행
- Production 배포: 완료·성공
- 운영 DB 마이그레이션 적용: 완료
  - 적용 후 101건 전체 최신 상태 확인
  - 적용 전 `pg_dump` 백업 및 `pg_restore --list` 검증 완료
- 메신저봇R V39 전체 코드 교체: 미실행
- 운영 사이트 공개 경로·권한 경계·카카오 서버 API 스모크: 완료
- 실제 카카오 단말·Android 이미지 콜백 실검증: 미실행

## 카카오봇 산출물

- 파일: `KLOL_KAKAO_BOT_V39_FAST_REGISTRATION.js`
- 버전: `KLOL_KAKAO_BOT_V39_FAST_REGISTRATION_R1_2026_08_31`
- SHA-256: `DB7B366298A35F9804A62E23173426ED4806249C6B8BD8B78EFF0637619DADB3`

## 남은 위험

- 카카오는 불변 사용자 ID가 없으므로 코드 없는 WR 자동 선택은 표시 이름 대조에 의존한다. 동명이거나 후보가 여러 건이면 반드시 WR 코드를 사용해야 한다.
- 저장 사진 OCR은 운영 Blob과 실제 결과 화면 품질에 따라 수동 보정이 필요할 수 있다.
- 운영 DB와 사이트 코드는 함께 반영됐으며, 코드 롤백 시에도 이번 nullable 컬럼·고유 인덱스 추가는 이전 코드와 호환된다.
- 사이트 코드는 운영 반영됐지만 메신저봇R 단말 코드는 아직 교체하지 않았으므로 카카오 채팅 명령은 `/봇버전` 확인 전까지 운영 반영으로 볼 수 없다.
- 로그인 사용자·관리자의 실제 사진 업로드와 Vercel Runtime Logs 확인은 운영 계정 접근이 필요한 미확인 항목이다.
