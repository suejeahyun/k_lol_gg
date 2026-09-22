# Kakao response performance 1.0.0 and inhouse description

User reported over 30 seconds for 내전상세1 / 내전상세 1. The production read-only baseline measured detail at 265 ms. These measurements are separate from the user's actual device event; its end-to-end delay is not proven fixed.

R25's legacy response synchronously probes imageDB.getImage, getImageBase64 and getImageBitmap before routing text. R26 passes imageDB only for empty/image-placeholder messages, preserving legacy image behavior and callback receiver. The fixture remains immutable. Tests assert zero image probes for text, one signed request per detail command, both compact/spaced spellings, and diagnostic retention across ordinary chat and echo. The SDK calls are a plausible device-side delay source; no remote phone profiling was available.

봇속도 reports the last server command's callback processing and HTTP elapsed milliseconds without message/member/secret contents. Time before callback receipt is excluded. No automatic retry or extra network probe was added. R26 installation and actual phone latency remain pending.

Roster matching batches active member candidates and existing memberships under the existing transaction locks. Ten registered members: 58 → 40 SQL statements; ten guests: 48 → 39; unchanged ten guests: 36 → 27. Tests enforce one candidate query per roster and one existing membership query, independent of participant count. Same-batch aliases roll back atomically; cancelled membership reuse, ambiguous names, next-save links and SITE/review protection remain covered. Local millisecond samples are not production speed claims.

내전 정보 uses the existing round gameInfo field: modern forms emit a blank editable line; aliases 게임정보/게임 정보/내전정보 work; explicit blank clears; omitted old field preserves; duplicate labels, length >500 and control characters fail closed. 3-way metadata merge prevents stale overwrite. No schema migration.

Run npm run check and V2_DB_CONTRACT_SCOPE=recruiting npm run test:db. Release/deployment and final validation evidence are recorded separately. Production smoke sends only read commands and never sends Kakao chat messages or edits real rosters.

Production verified 2026-09-22T01:06:42.430Z: source 6484547030678061324558b5a4759d76b2ce068b, deployment dpl_37qaRw4iFUEym3CTifacBDhrbeYW, both detail spellings return 내전 정보. Read latency samples 505/410 ms exclude phone delivery; no claim of measured end-to-end improvement. Local full check: 433 contract +950 unit PASS (one DB skip), focused DB/boundaries 97 PASS, phone 36 PASS, lint zero errors (55 existing warnings), secret scan PASS. R26 private artifact LF 61903 / CRLF 63772, SHA-256 a876e91309c5d715c168319eceb0dd1c017be427e57d5afcf8039e469b4768ce.

Historical Vercel logs for 09:53 KST contain two HTTP 200 command requests with internal durations 167 ms and 221 ms. Route logging is duration/status/trace only, so raw command identity is unavailable and these cannot be definitively attributed to the user transcript. Internal duration excludes SDK notification delivery, DNS/TLS, platform startup before handler invocation and Kakao reply delivery. See reported-minute-server-timing.json.

GitHub main CI 35674495735 succeeded at the recorded check time, including npm run check and administrator HTTP authentication matrix. Source 6484547030678061324558b5a4759d76b2ce068b.
