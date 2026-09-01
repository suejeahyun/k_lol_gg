import { pgSchema } from "drizzle-orm/pg-core";

export const authSchema = pgSchema("auth");
export const registrySchema = pgSchema("registry");
export const auditSchema = pgSchema("audit");
export const competitionSchema = pgSchema("competition");
