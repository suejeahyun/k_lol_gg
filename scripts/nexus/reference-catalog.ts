import type { Pool } from "pg";
import { canonicalChampionDisplayName, canonicalChampionKey } from "../../src/modules/champions/domain/champion";
import { officialChampionImageUrl } from "../../src/modules/champions/domain/champion-image";
import { DATA_DRAGON_CHAMPIONS, DATA_DRAGON_EXPECTED_CHAMPION_COUNT, DATA_DRAGON_VERSION } from "../../src/modules/champions/domain/data-dragon-catalog";

export function nexusReferenceChampions() {
  if (DATA_DRAGON_CHAMPIONS.length !== DATA_DRAGON_EXPECTED_CHAMPION_COUNT) throw new Error("NEXUS reference catalog count does not match the pinned dataset.");
  return DATA_DRAGON_CHAMPIONS.map((champion) => {
    const key = canonicalChampionKey(champion.id);
    const displayName = canonicalChampionDisplayName(champion.name);
    const imageUrl = officialChampionImageUrl(key, displayName);
    if (!imageUrl) throw new Error("NEXUS reference catalog contains an unknown champion.");
    return { key, displayName, imageUrl };
  });
}

/** Adds only pinned official reference rows; existing administrator edits win. */
export async function seedNexusReferenceCatalog(pool: Pool, expectedDatabaseName: string) {
  const actual = (await pool.query("select current_database() as name")).rows[0].name;
  if (actual !== expectedDatabaseName) throw new Error("NEXUS reference catalog target does not match the confirmed database.");
  const identity = (await pool.query("select brand_name from operations.site_settings where id = 1")).rows[0]?.brand_name;
  if (identity !== "NEXUS.GG") throw new Error("NEXUS reference catalog requires an initialized NEXUS database.");
  const champions = nexusReferenceChampions();
  await pool.query("begin");
  try {
    await pool.query("select pg_advisory_xact_lock(hashtext('nexus-reference-catalog'))");
    let inserted = 0;
    for (const champion of champions) {
      const result = await pool.query(`insert into catalog.champions (key, display_name, image_url, status)
        values ($1, $2, $3, 'ACTIVE') on conflict (key) do nothing`, [champion.key, champion.displayName, champion.imageUrl]);
      inserted += result.rowCount ?? 0;
    }
    await pool.query("commit");
    return { service: "nexus", reference: "Riot Data Dragon", version: DATA_DRAGON_VERSION, pinnedChampions: champions.length, inserted, existingPreserved: champions.length - inserted, communityRowsCreated: 0 };
  } catch (error) {
    await pool.query("rollback");
    throw error;
  }
}
