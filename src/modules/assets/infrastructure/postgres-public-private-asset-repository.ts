import { and, eq, or, sql } from "drizzle-orm";

import { privateAssets } from "@/platform/db/schema/matches";
import type { V2Database } from "@/platform/db/database";

import type { PublicPrivateAssetRepository } from "../application/ports/public-private-asset-repository";
import type { PrivateAssetRecord } from "../domain/private-asset";

export class PostgresPublicPrivateAssetRepository implements PublicPrivateAssetRepository {
  constructor(private readonly database: V2Database) {}

  async findReadyPublished(assetId: string): Promise<PrivateAssetRecord | null> {
    const publishedBinding = or(
      sql<boolean>`exists (
        select 1 from "media"."highlights" h
        where h."thumbnail_asset_id" = ${privateAssets.id} and h."status" = 'PUBLISHED'
      )`,
      sql<boolean>`exists (
        select 1 from "media"."gallery_assets" ga
        join "media"."galleries" g on g."id" = ga."gallery_id"
        where ga."private_asset_id" = ${privateAssets.id} and g."status" = 'PUBLISHED'
      )`,
    );
    const row = (await this.database.select().from(privateAssets).where(and(
      eq(privateAssets.id, assetId),
      eq(privateAssets.status, "READY"),
      publishedBinding,
    )).limit(1))[0];
    if (
      !row ||
      (row.purpose !== "GALLERY" && row.purpose !== "HIGHLIGHT_THUMBNAIL") ||
      (row.contentType !== "image/png" && row.contentType !== "image/jpeg" && row.contentType !== "image/webp")
    ) return null;
    return {
      id: row.id,
      createdByUserAccountId: row.createdByUserAccountId,
      ingestSource: row.ingestSource,
      storageProvider: row.storageProvider,
      storageKey: row.storageKey,
      originalFileName: row.originalFileName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      width: row.width,
      height: row.height,
      sha256: row.sha256,
      purpose: row.purpose,
      status: row.status,
      readyAt: row.readyAt?.toISOString() ?? null,
      deleteRequestedAt: row.deleteRequestedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
