/**
 * S12-owned seam. S06 never calls an external Riot endpoint; a later adapter may
 * enqueue a consented sync and feed its persisted result into the rating provider.
 */
export interface RiotSoloRankSyncPort {
  requestPersistedSync(input: Readonly<{
    draftId: string;
    actorUserAccountId: string;
  }>): Promise<Readonly<{ accepted: boolean; requestId: string | null }>>;
}

export const disabledRiotSoloRankSyncPort: RiotSoloRankSyncPort = Object.freeze({
  async requestPersistedSync() {
    return { accepted: false, requestId: null };
  },
});
