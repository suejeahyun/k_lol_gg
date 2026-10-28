import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import type { CommunityPublicSite, CommunitySite, CreateCommunitySiteCommand, OwnerCommunitySiteCommand, ReviewCommunitySiteCommand } from "../domain/community-site";

export type CommunitySiteCommandMetadata = Readonly<{
  requestId: string; requestKey: string; requestHashHex: string; expectedRevision: number;
}>;
export type CommunitySiteCommandResult = Readonly<{
  status: number; body: { site: CommunitySite }; revision: number; replayed: boolean;
}>;
export interface CommunitySitesRepository {
  getPublicSites(): Promise<CommunityPublicSite[]>;
  listSites(actor: TransactionSessionActor, scope: "owner" | "admin"): Promise<CommunitySite[]>;
  getSite(actor: TransactionSessionActor, id: string, scope: "owner" | "admin"): Promise<CommunitySite>;
  createSite(input: { actor: TransactionSessionActor; metadata: CommunitySiteCommandMetadata; command: CreateCommunitySiteCommand }): Promise<CommunitySiteCommandResult>;
  updateSite(input: { actor: TransactionSessionActor; id: string; metadata: CommunitySiteCommandMetadata; command: OwnerCommunitySiteCommand }): Promise<CommunitySiteCommandResult>;
  reviewSite(input: { actor: TransactionSessionActor; id: string; metadata: CommunitySiteCommandMetadata; command: ReviewCommunitySiteCommand }): Promise<CommunitySiteCommandResult>;
}
