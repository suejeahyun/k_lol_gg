# Kakao V4 / V1 compatibility contract evidence

## Scope

- Contract and fixture only; no runtime implementation, database, or production deployment changes.
- Branch: `contracts/kakao-v4-v1-compat-20260910`
- V1 source SHA-256: `c91a56a289a762fe7e08143e8fd4b55c9695c4df68ebfcb6689613dcb73776b7`

## Artifacts

- `docs/contracts/KAKAO_V4_V1_COMPATIBILITY_CONTRACT.md`
- `tests/fixtures/kakao-v4-v1-compatibility-contract.json`
- `tests/kakao-v4-v1-compatibility-contract.test.mjs`
- `qa/2026-09-10-kakao-v4-v1-contract/DISCORD_PATCH_NOTICE.md`

## Verification command

```powershell
node --test tests/kakao-v4-v1-compatibility-contract.test.mjs
```

Existing V1 golden regression set:

```powershell
node --test tests/kakao-v40-exact-reply-parity.test.mjs tests/kakao-v40-scrim-exact-parity.golden.test.mjs tests/kakao-v40-misc-command-parity.test.mjs tests/kakao-v41-v1-inhouse-golden.test.mjs tests/kakao-v41-v1-compat.test.mjs tests/kakao-v41-v1-router-integration.test.mjs
```

Record the commands' terminal results in the task/commit report; generated logs are intentionally not committed.
