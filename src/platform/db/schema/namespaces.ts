import { pgSchema } from "drizzle-orm/pg-core";

export const authSchema = pgSchema("auth");
export const registrySchema = pgSchema("registry");
export const auditSchema = pgSchema("audit");
export const competitionSchema = pgSchema("competition");
export const assetsSchema = pgSchema("assets");
export const catalogSchema = pgSchema("catalog");
export const statisticsSchema = pgSchema("statistics");
export const teamToolsSchema = pgSchema("team_tools");
export const mmrSchema = pgSchema("mmr");
export const recruitingSchema = pgSchema("recruiting");
