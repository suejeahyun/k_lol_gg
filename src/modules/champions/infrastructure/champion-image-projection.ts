import { sql } from "drizzle-orm";

/**
 * Reads the optional image column through the row JSON shape. This keeps public
 * reads available while migration 0025 is rolling out: PostgreSQL returns null
 * when an older `catalog.champions` row type does not contain `image_url`.
 */
export function championImageUrlProjection() {
  return sql<string | null>`to_jsonb("champions") ->> 'image_url'`;
}
