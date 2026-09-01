import type {
  AdminPlayer,
  AdminPlayerListQuery,
  AdminPlayerPage,
  PlayerMutationCommand,
  PlayerMutationOutcome,
  PlayerWriteInput,
} from "../../domain/admin-player";

export interface AdminPlayerRepository {
  list(query: AdminPlayerListQuery): Promise<AdminPlayerPage>;
  findById(id: string): Promise<AdminPlayer | null>;
  create(input: PlayerWriteInput, command: PlayerMutationCommand): Promise<PlayerMutationOutcome>;
  update(
    id: string,
    input: PlayerWriteInput,
    expectedRevision: number,
    command: PlayerMutationCommand,
  ): Promise<PlayerMutationOutcome>;
  deactivate(
    id: string,
    expectedRevision: number,
    command: PlayerMutationCommand,
  ): Promise<PlayerMutationOutcome>;
  reactivate(
    id: string,
    expectedRevision: number,
    command: PlayerMutationCommand,
  ): Promise<PlayerMutationOutcome>;
}
