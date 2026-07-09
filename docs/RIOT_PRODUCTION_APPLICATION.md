# K-LOL.GG Riot Production Application Guide

## 1. Product overview

K-LOL.GG is a League of Legends community platform currently used by approximately 150 players. The service supports in-house match records, player profiles, recruitment, community tournament operations, team balancing, and administrative tools.

The product is operated as a live web service for a Korean League of Legends community. Riot API integration will be used to improve the accuracy of player profiles, ranked information, tournament verification, and team balancing workflows.

## 2. Riot API usage purpose

We plan to use the Riot Games API to allow users to connect their Riot account using Riot ID, retrieve their ranked solo queue information, and summarize recent ranked match history.

This data will be used for player profile display, fairer team balancing, participant verification for community tournaments, and administrative review. Riot data will be used as a supporting signal and will not replace administrator judgment for community operations.

## 3. Security and caching statement

All Riot API requests are made server-side through K-LOL.GG internal API routes. The Riot API key is stored only in server environment variables and is never exposed to client-side code.

Riot account data, ranked data, and match summaries are cached in our PostgreSQL database. Pages read cached data from our database and do not call Riot APIs directly on page load. We also keep API request logs, sync job records, cooldown controls, and admin-only sync controls to reduce unnecessary requests and comply with rate limits.

## 4. Review flow

1. Log in to K-LOL.GG.
2. Open My Page > Riot Account.
3. Enter Riot ID and connect the account.
4. Open a player profile and view the ranked solo queue summary.
5. Open the Riot detailed player page to review recent ranked match summaries.
6. Open the admin Riot dashboard to review account status, sync jobs, and API logs.
7. Open tournament participant pages to see Riot verification badges.
8. Open the team balance page to see Riot data used as an optional supporting signal.

## 5. Non-affiliation notice

K-LOL.GG is not endorsed by Riot Games and does not reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## 6. Rollout plan after approval

After Production API approval, we will enable the Riot feature flag in production and roll out the feature gradually. We will first test a single admin account, then a small group of connected players, and then enable the feature for general users.

Bulk synchronization is limited to small batches to avoid serverless timeouts and unnecessary API usage. Failed accounts can be retried separately by administrators.

## 7. Application metadata

- Product name: K-LOL.GG
- Product type: Production web application
- Game: League of Legends
- Primary region: KR / Asia routing
- Current user scale: Approximately 150 community players
- Requested APIs: Account, Summoner, League, Match
- Tournament API: Not required for first approval request
- Data storage: Server-side PostgreSQL cache

## 8. Pre-application checklist

- /terms, /privacy, /riot-api pages are publicly accessible.
- Riot features remain safely disabled when RIOT_FEATURE_ENABLED=false.
- RIOT_API_KEY is not declared as NEXT_PUBLIC_RIOT_API_KEY.
- No RGAPI key is committed to GitHub or exposed in client-side bundles.
- Admin Riot dashboard, account list, logs, and sync pages are accessible.
- User Riot link page and /app/me/riot page are accessible.
- Riot API calls are server-side only.
- Player pages read cached Riot data from the database.
- Admin sync controls are protected by role checks.

## 9. Approval activation checklist

1. Add RIOT_API_KEY to Vercel Production Environment Variables.
2. Set RIOT_FEATURE_ENABLED=true.
3. Deploy production.
4. Test one admin account.
5. Test up to five connected players.
6. Test batch sync in groups of 20 to 30 accounts.
7. Review Riot API request logs and failed sync jobs.
8. Enable the feature for general users.
