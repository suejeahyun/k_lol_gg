# 기능 단위 릴리스 근거

`registry.json`은 기능 버전, Git tag, migration head, QA 문서와 배포 결과를 한 항목으로 연결한다. 전체 앱 버전만 올려 서로 다른 기능의 검증 상태를 숨기지 않는 것이 목적이다.

## 등록 규칙

1. 기능 ID는 소문자 kebab-case, 버전은 SemVer를 사용한다.
2. tag는 `<feature-id>-v<semver>`이며 한 번 게시한 tag를 이동하지 않는다.
3. `commit`은 tag가 가리키는 40자리 Git SHA와 같아야 한다.
4. `migrationHead`는 해당 릴리스가 검증한 `drizzle/meta/_journal.json` entry를 기록한다.
5. `qaEvidence`와 `patchNotes`는 저장소 내부 파일이어야 한다.
6. 운영 배포는 provider 배포 ID, immutable URL, 운영 alias, 확인 시각과 health 결과를 기록한다.
7. 서버 배포와 휴대폰/외부 앱 설치는 별도 상태로 기록한다. 설치하지 않은 것을 운영 반영으로 표시하지 않는다.

## 명령

```bash
npm run release:evidence:check
```

검사는 JSON 구조, 중복, 파일 존재, migration entry, Git tag와 commit 일치, 배포 근거의 필수 필드를 확인한다. Git tag를 포함하지 않은 shallow checkout에서는 먼저 tag를 fetch해야 한다.

## 상태 정의

- `PRODUCTION`: 기록된 commit의 운영 배포와 health/smoke 근거가 있음
- `PREVIEW`: 미리보기 배포만 있음
- `NOT_DEPLOYED`: 소스/검증만 존재하며 외부 배포 없음
- `INSTALLED`: 외부 설치본 버전이 실기기에서 확인됨
- `PENDING_USER_INSTALL`: 설치용 산출물은 있으나 실기기 교체가 확인되지 않음

새 릴리스는 기존 항목을 수정해 덮지 않고 배열 끝에 patch/minor/major 버전으로 추가한다.
