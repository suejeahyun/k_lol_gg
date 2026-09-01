export type HomeFeedState = "ready" | "not-implemented";

export type HomeSnapshot = Readonly<{
  activePlayerCount: number;
  feeds: Readonly<{
    playerRegistry: HomeFeedState;
    season: HomeFeedState;
    recentMatches: HomeFeedState;
    recruits: HomeFeedState;
    competitions: HomeFeedState;
    gallery: HomeFeedState;
  }>;
}>;

export type HomeSnapshotResult =
  | Readonly<{ state: "ready"; snapshot: HomeSnapshot }>
  | Readonly<{ state: "unavailable" }>
  | Readonly<{ state: "error" }>;
