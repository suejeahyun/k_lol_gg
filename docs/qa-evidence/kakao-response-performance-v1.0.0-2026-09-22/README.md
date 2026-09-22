# Kakao response performance 1.0.0 and inhouse description

User reported over 30 seconds for 내전상세1 / 내전상세 1. The production read-only baseline measured detail at 265 ms. These measurements are separate from the user's actual device event; its end-to-end delay is not proven fixed.

R25's legacy response synchronously probes imageDB.getImage, getImageBase64 and getImageBitmap before routing text. R26 passes imageDB only for empty/image-placeholder messages, preserving legacy image behavior and callback receiver. The fixture remains immutable. Tests assert zero image probes for text, one signed request per detail command, both compact/spaced spellings, and diagnostic retention across ordinary chat and echo. The SDK calls are a plausible device-side delay source; no remote phone profiling was available.

봇속도 reports the last server command's callback processing and HTTP elapsed milliseconds without message/member/secret contents. Time before callback receipt is excluded. No automatic retry or extra network probe was added. R26 installation and actual phone latency remain pending.

Roster matching batches active member candidates and existing memberships under the existing transaction locks. Ten registered members: 58 → 40 SQL statements; ten guests: 48 → 39; unchanged ten guests: 36 → 27. Tests enforce one candidate query per roster and one existing membership query, independent of participant count. Same-batch aliases roll back atomically; cancelled membership reuse, ambiguous names, next-save links and SITE/review protection remain covered. Local millisecond samples are not production speed claims.

내전 정보 uses the existing round gameInfo field: modern forms emit a blank editable line; aliases 게임정보/게임 정보/내전정보 work; explicit blank clears; omitted old field preserves; duplicate labels, length >500 and control characters fail closed. 3-way metadata merge prevents stale overwrite. No schema migration.

Run npm run check and V2_DB_CONTRACT_SCOPE=recruiting npm run test:db. Release/deployment and final validation evidence are recorded separately. Production smoke sends only read commands and never sends Kakao chat messages or edits real rosters.
