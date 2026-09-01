export type PlayerQueryValue = string | readonly string[] | undefined;

const MAX_PLAYER_QUERY_LENGTH = 80;

export function normalizePlayerQuery(value: PlayerQueryValue): string {
  const firstValue = Array.isArray(value) ? value[0] : value;

  return (firstValue ?? "").trim().slice(0, MAX_PLAYER_QUERY_LENGTH);
}
