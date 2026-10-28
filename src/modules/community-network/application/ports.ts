import type { TransactionSessionActor } from "@/modules/auth/domain/transaction-session";
import type { CommunityNetworkInput, CommunityNetworkPublicCommunity, CommunityNetworkSnapshot } from "../domain/community-network";

export type CommunityNetworkCommandMetadata = Readonly<{
  requestId: string;
  requestKey: string;
  requestHashHex: string;
  expectedRevision: number;
}>;

export type CommunityNetworkCommandResult = Readonly<{
  status: number;
  body: { snapshot: CommunityNetworkSnapshot };
  revision: number;
  replayed: boolean;
}>;

export interface CommunityNetworkRepository {
  getSnapshot(): Promise<CommunityNetworkSnapshot>;
  getPublicDirectory(): Promise<CommunityNetworkPublicCommunity[]>;
  updateSnapshot(input: Readonly<{
    actor: TransactionSessionActor;
    metadata: CommunityNetworkCommandMetadata;
    snapshot: CommunityNetworkInput;
  }>): Promise<CommunityNetworkCommandResult>;
}
