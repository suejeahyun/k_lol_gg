import type { ReactNode } from "react";

export type DiscordOpsNavKey =
  | "overview"
  | "bot"
  | "voice"
  | "recruits"
  | "matches"
  | "discipline"
  | "stats"
  | "logs"
  | "diagnostics"
  | "settings";

export default function DiscordOpsNav(_: { active: DiscordOpsNavKey }): ReactNode {
  return null;
}
