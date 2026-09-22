# R27 local diagnostic hardening

At 19:47 KST the user confirmed R26 via a version reply and reported no reply to 봇속도. The delivered R26 artifact hash matches the prior release; its plain-text diagnostic responds in VM tests. The device root cause is NOT established. This release hardens diagnostics and adds evidence for the next device attempt, without claiming to resolve end-to-end latency.

Local version/speed/diagnostic commands run before gateway request initialization and use the original Replier independently of HTTP delivery suppression. All three return version and the last completed request timing. Spaces, full-width slash and zero-width paste characters are normalized. Fixed logs RECEIVED / RETURNED / REJECTED / REPLY_ERROR contain no message, sender, room, configuration or exception text. RETURNED only confirms the SDK call returned, not chat delivery. Logging failure cannot block the reply. Bot echoes remain ignored.

Tests cover unavailable request/settings state, forced response suppression, image access prevention, normalized inputs, reply exceptions, false SDK return, missing/broken logger and retaining the prior timing. Transport internal identifier shortening preserves JSON/HMAC fields while respecting the 65,535-character limit. Canonical legacy functions remain unchanged. No server/DB/site companion behavior changes. R26 remains installed; R27 installation is pending. Existing published QA is unchanged.

Validation: npm run check PASS (lint, typecheck, ERD check, 435 contract tests, 951 unit tests with one DB-dependent skip, home-art verification and production build). Phone regression suite 38 PASS. Public ES5/Rhino and LF/CRLF limits PASS; private installer body matches tested public executable exactly. Secret scan and git diff --check PASS. No DB or server boundary changed, so no new production data mutation or database test was needed.

Delivery: general-R27 JS/TXT and ZIP generated privately; artifact.json records the hash and size. This is a phone-only release, pending installation. There is no new server runtime behavior to deploy. The latest verified server evidence remains party-copy-refresh-v1.0.0.
