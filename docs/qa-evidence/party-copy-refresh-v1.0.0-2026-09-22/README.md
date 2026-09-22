# Party saved-copy refresh 1.0.0

The reported flow reuses a blank draft code for two initial members, a later third join, then a blank third slot. The issued draft never contained the third member. Three-way merge correctly preserves an intervening participant, but the same-content reply and overview did not explain that cancellation failed or supply a fresh editable form.

Short-code party saves now return the saved outcome plus a freshly queried scoped detail form. No-change replies explicitly say no change was made, explain old empty slots, and provide the explicit remove command. All-parties overview remains for finish and legacy forms. The same single post-mutation read is narrowed to room/operating day/number. No extra network request is added on the phone. Refresh failure reports the saved outcome and recovery command without retrying mutation.

Tests cover copying the entire saved reply into the next edit, unchanged recovery guidance, scoped detail reads, detail-refresh failure, and the exact empty-draft/three-members/two-submitted/latest-form cancellation sequence with synthetic names. Existing merge, ownership, concurrency and idempotency rules are preserved. No schema changes or production member deletion.

Available production logs show 19:00:13 KST handler 91 ms and 19:17:45 KST handler 56 ms. These cannot prove phone notification/network delay or exact command identity; duplicates from CLI pagination are removed. No phone installation confirmation or speed diagnostic has been provided for R26. Hidden chat messages cannot establish whether the bot responded.

Validation/deployment evidence is added below after completion. Existing published QA is unchanged.
