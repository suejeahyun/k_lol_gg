# Kakao room capability profiles

## Scope

- Base: `106f7372` (R14.2.1)
- Additive room profiles: `RECRUIT`, `FEATURES`
- Existing rooms and pending pairing rows backfill to `RECRUIT` through a non-null default.
- One installation still references exactly one canonical room.
- No Production database, Vercel deployment, phone bundle, V1 parser, or recruiting aggregate was changed.

## Contracts

- `KakaoRoomAuthorization.capabilityProfile` exposes the bound room profile.
- `authorize({ requiredCapabilityProfile })` rejects a wrong-room command with `ROOM_CAPABILITY_FORBIDDEN` before creating a member row.
- `RECRUIT_KAKAO_ROOM_COMMAND` and `FEATURES_KAKAO_ROOM_COMMAND` are ready for route-level opt-in.
- Pairing a new room stores the selected profile. Adding an installation to an existing room preserves that room's profile and rejects a mismatched request.
- SUPER-only administrator mutation checks, one-time hashed pairing codes, and installation-to-room cardinality are unchanged.

## Migration

- Head: `0034_kakao_room_capability_profiles`
- Adds enum `recruiting.kakao_room_capability_profile`.
- Adds `capability_profile NOT NULL DEFAULT 'RECRUIT'` to `recruiting.kakao_rooms` and `recruiting.kakao_room_pairings`.
- PostgreSQL 18 recovery drill: migration count 35, exact table counts matched, replay no-op true, failed migration rolled back true.
- Rollback plan before application rollback: stop new pairing issuance, restore the prior application, then drop the two columns and enum only after confirming no `FEATURES` rows exist. Production rollback was not executed.

## Verification

- `npm run typecheck`: pass
- `npm run test:unit`: 482/482 pass
- `npm run test:contracts`: 217/217 pass
- `npm run test:db` on disposable PostgreSQL 18: pass, including fresh install, 0033 preservation, 0034 RECRUIT backfill, migration replay, failed migration rollback, and archive restore
- `npm run build`: pass
- `npm run lint`: 0 errors; 24 pre-existing warnings in MessengerBot bundles and one recruiting contract fixture
- `git diff --check`: pass

## Follow-up recommendations

1. Wire recruiting routes to `RECRUIT_KAKAO_ROOM_COMMAND` and feature/form routes to `FEATURES_KAKAO_ROOM_COMMAND`.
2. Make the phone router silently ignore `ROOM_CAPABILITY_FORBIDDEN` so two installed bots do not duplicate replies.
3. Generate a second installation identity and pair it only after the FEATURES deployment is ready.
4. Add an administrator filter and audit summary by capability profile after both rooms have real traffic.

