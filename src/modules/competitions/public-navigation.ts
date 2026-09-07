export const COMPETITION_SAVED_VIEWS = ["event", "destruction"] as const;
export type CompetitionSavedView = (typeof COMPETITION_SAVED_VIEWS)[number];

export function parseCompetitionSavedView(input: URLSearchParams): CompetitionSavedView | null {
  if (input.getAll("type").length > 1) return null;
  const value = input.get("type") ?? "event";
  return COMPETITION_SAVED_VIEWS.includes(value as CompetitionSavedView)
    ? value as CompetitionSavedView
    : null;
}

export type DestructionDetailView = Readonly<{
  action: "apply" | null;
  tab: "overview" | "captain-points" | "participants" | "gallery" | "mvp";
  playerId: string | null;
  imageIndex: number | null;
}>;

const DETAIL_KEYS = new Set(["action", "tab", "participant", "player", "image", "imageIndex"]);
const DETAIL_TABS = new Set(["captain-points", "participants", "gallery", "mvp"]);
const SAFE_LEGACY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const IMAGE_INDEX = /^(?:0|[1-9][0-9]{0,3})$/u;

export function parseEventDetailAction(input: URLSearchParams): "apply" | null | undefined {
  if ([...input.keys()].some((key) => key !== "action") || input.getAll("action").length > 1) return undefined;
  const action = input.get("action");
  return action === null ? null : action === "apply" ? action : undefined;
}

export function parseDestructionDetailView(input: URLSearchParams): DestructionDetailView | null {
  if ([...input.keys()].some((key) => !DETAIL_KEYS.has(key))) return null;
  for (const key of DETAIL_KEYS) if (input.getAll(key).length > 1) return null;

  const action = input.get("action");
  const rawTab = input.get("tab");
  const participant = input.get("participant");
  const player = input.get("player");
  const image = input.get("image");
  const imageIndex = input.get("imageIndex");
  if (action !== null && action !== "apply") return null;
  if (rawTab !== null && !DETAIL_TABS.has(rawTab)) return null;
  if (participant !== null && player !== null) return null;
  if (image !== null && imageIndex !== null) return null;

  const selectedPlayer = participant ?? player;
  const selectedImage = imageIndex ?? image;
  if (selectedPlayer !== null && (!SAFE_LEGACY_ID.test(selectedPlayer) || rawTab !== "participants")) return null;
  if (selectedImage !== null && (!IMAGE_INDEX.test(selectedImage) || rawTab !== "gallery")) return null;

  return Object.freeze({
    action: action as "apply" | null,
    tab: (rawTab ?? "overview") as DestructionDetailView["tab"],
    playerId: selectedPlayer,
    imageIndex: selectedImage === null ? null : Number(selectedImage),
  });
}

export type DestructionAdminDetailView = "default" | "auction-live";

export function parseDestructionAdminDetailView(input: URLSearchParams): DestructionAdminDetailView | null {
  if ([...input.keys()].some((key) => key !== "tab" && key !== "mode")) return null;
  if (input.getAll("tab").length > 1 || input.getAll("mode").length > 1) return null;
  const tab = input.get("tab");
  const mode = input.get("mode");
  if (tab === null && mode === null) return "default";
  return tab === "auction" && mode === "live" ? "auction-live" : null;
}
