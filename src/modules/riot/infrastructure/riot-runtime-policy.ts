export function isRiotFeatureEnabled(environment: Readonly<{ V2_RIOT_INTEGRATION_ENABLED?: string }>) {
  return environment.V2_RIOT_INTEGRATION_ENABLED === "true";
}
