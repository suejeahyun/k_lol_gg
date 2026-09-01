export interface PublicPlayerLegacyMappingRepository {
  findPublicUuidByLegacyId(legacyId: number): Promise<string | null>;
}
